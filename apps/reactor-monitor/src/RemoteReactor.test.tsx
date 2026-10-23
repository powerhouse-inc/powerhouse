// @vitest-environment happy-dom
import type {
  WireInspectorAccess,
  WireReactorInfo,
} from "@powerhousedao/reactor";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { App } from "./App.js";
import {
  NO_PROCESSOR_LEVERS_REASON,
  NOT_AN_OPERATOR_REASON,
  READS_ONLY_REASON,
  STILL_NOT_AN_OPERATOR,
} from "./components/AdminGate.js";
import type { ProvisionRequest } from "./components/ProvisionPanel.js";
import { buildDescriptor as buildFormDescriptor } from "./provisioning.js";
import { MonitoringSetsStore } from "./monitoring-sets.js";

const WAIT = { timeout: 10_000 } as const;

const OPEN_READS = new Set([
  "ReactorInspectionInfo",
  "ReactorInspectionDocumentModels",
  "ReactorInspectionDrives",
  "ReactorInspectionDriveIntegrity",
  "ReactorInspectionValidateDocument",
]);

/** The far side's posture; mutable so a re-check can pick a change up. */
type Host = {
  access: WireInspectorAccess | null;
  /** When set, only a caller presenting it is an operator. */
  adminBearer?: string;
  workflows?: boolean;
  syncChannels?: readonly string[];
  /** Whether the host serves inspection-admin to an operator. */
  levers?: boolean;
};

const OPERATOR: WireInspectorAccess = { admin: false, sql: false };

function fakeInspectionFetch(host: Host): typeof fetch {
  const answers: Partial<Record<string, () => unknown>> = {
    ReactorInspectionInfo: () => {
      const info: WireReactorInfo = {
        storage: {
          engine: "postgres",
          persistence: "server",
          durable: true,
          selfHeal: false,
        },
        workflows: host.workflows ?? false,
        syncChannels: host.syncChannels ?? ["polling"],
        access: host.access,
      };
      return { inspection: { info } };
    },
    ReactorInspectionDocumentModels: () => ({
      inspection: { documentModels: [] },
    }),
    ReactorInspectionRemotes: () => ({ inspection: { remotes: [] } }),
    ReactorInspectionStorageHealth: () => ({
      inspection: {
        storageHealth: {
          tracked: true,
          healthy: true,
          everRecreated: false,
          recreateCount: 0,
        },
      },
    }),
    ReactorInspectionQueueState: () => ({
      inspection: {
        queueState: {
          isPaused: false,
          totalPending: 0,
          totalExecuting: 0,
          pendingJobs: [],
          executingJobs: [],
        },
      },
    }),
    ReactorInspectionProcessors: () => ({
      inspection: {
        processors: [
          {
            processorId: "factory:drive:0",
            factoryId: "factory",
            driveId: "drive",
            processorIndex: 0,
            lastOrdinal: 40,
            status: "active",
            lastError: null,
            lastErrorTimestampUtcMs: null,
            floor: 0,
            clearable: true,
            runFrom: 40,
            phase: "live",
          },
        ],
      },
    }),
    ReactorInspectionCatchUp: () => ({
      inspection: { catchUpStatus: { consumers: [], watermark: null } },
    }),
  };

  return (input, init) => {
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {
      query: string;
    };
    const name = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? "";
    if (host.adminBearer !== undefined) {
      const auth = new Headers(init?.headers).get("authorization");
      host.access = auth === `Bearer ${host.adminBearer}` ? OPERATOR : null;
    }
    if (String(input).endsWith("/inspection-admin")) {
      if (!host.levers || host.access === null) {
        return Promise.resolve(new Response("Not Found", { status: 404 }));
      }
      return Promise.resolve(
        Response.json({
          data:
            name === "ReactorInspectionAdminAccess"
              ? { inspectionAdmin: { processors: true } }
              : { [name]: true },
        }),
      );
    }
    if (host.access === null && !OPEN_READS.has(name)) {
      return Promise.resolve(
        Response.json({
          errors: [
            {
              message: "Forbidden: insufficient permissions",
              extensions: { code: "FORBIDDEN" },
            },
          ],
          data: null,
        }),
      );
    }
    const answer = answers[name];
    return Promise.resolve(
      answer === undefined
        ? Response.json({ errors: [{ message: `no stub for ${name}` }] })
        : Response.json({ data: answer() }),
    );
  };
}

function remoteApp(host: Host): ReturnType<typeof render> {
  const buildDescriptor = (request: ProvisionRequest): ReactorDescriptor => {
    const built = buildFormDescriptor(request);
    return {
      ...built,
      remote: {
        url: built.remote?.url ?? "",
        ...built.remote,
        fetch: fakeInspectionFetch(host),
      },
    };
  };
  return render(<App buildDescriptor={buildDescriptor} />);
}

async function provisionRemoteReactor(
  view: ReturnType<typeof remoteApp>,
  name: string,
  bearer?: string,
) {
  fireEvent.change(view.getByDisplayValue("in-process"), {
    target: { value: "remote" },
  });
  fireEvent.change(view.getByPlaceholderText("alpha"), {
    target: { value: name },
  });
  fireEvent.change(view.getByPlaceholderText("http://localhost:4001/graphql"), {
    target: { value: "http://switchboard.test/graphql" },
  });
  if (bearer !== undefined) {
    fireEvent.change(view.getByLabelText("Bearer token"), {
      target: { value: bearer },
    });
  }
  fireEvent.click(view.getByRole("button", { name: "Provision" }));
  await waitFor(() => expect(view.getByTitle("ready")).toBeTruthy(), WAIT);
}

function badgeFor(view: ReturnType<typeof render>, label: string): string {
  const cell = [...view.container.querySelectorAll(".rm-cap")].find(
    (node) => node.querySelector(".rm-cap-label")?.textContent === label,
  );
  return cell?.querySelector(".rm-badge")?.textContent ?? "";
}

describe("remote reactor in the monitor app", () => {
  beforeEach(() => {
    try {
      window.localStorage.clear();
      window.sessionStorage.clear();
    } catch {
      // No storage in this environment.
    }
  });

  it("keeps a bearer across a reload, so a restored remote reads as an admin", async () => {
    const host: Host = { access: null, adminBearer: "admin-token" };
    const view = remoteApp(host);
    await provisionRemoteReactor(view, "reloaded-switchboard", "admin-token");
    view.unmount();

    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeInspectionFetch(host);
    try {
      const reloaded = render(<App />);
      await waitFor(
        () => expect(reloaded.getByTitle("ready")).toBeTruthy(),
        WAIT,
      );
      fireEvent.click(reloaded.getByText("reloaded-switchboard"));
      fireEvent.click(reloaded.getByRole("button", { name: "Queue" }));
      await waitFor(
        () => expect(reloaded.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
        WAIT,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 20_000);

  it("requires a URL, because a remote reactor IS its URL", () => {
    const view = remoteApp({ access: null });

    fireEvent.change(view.getByDisplayValue("in-process"), {
      target: { value: "remote" },
    });
    fireEvent.change(view.getByPlaceholderText("alpha"), {
      target: { value: "no-url" },
    });
    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    expect(
      view.getByText("A GraphQL URL is required for a remote reactor"),
    ).toBeTruthy();
    expect(view.getByText("No reactors provisioned yet.")).toBeTruthy();
  });

  it("swaps the sync-mode select for the URL field: nothing is built here", () => {
    const view = remoteApp({ access: null });

    expect(view.queryByDisplayValue("local only (brokered)")).toBeTruthy();
    fireEvent.change(view.getByDisplayValue("in-process"), {
      target: { value: "remote" },
    });

    expect(view.queryByDisplayValue("local only (brokered)")).toBeNull();
    expect(
      view.getByPlaceholderText("http://localhost:4001/graphql"),
    ).toBeTruthy();
    expect(view.getByTestId("provision-remote-note").textContent).toMatch(
      /attaches to that reactor and\s+inspects it/,
    );
  });

  it("renders the capability grid from the reactor's own info", async () => {
    const view = remoteApp({ access: null });
    await provisionRemoteReactor(view, "switchboard");

    const grid = view.getByLabelText("Reactor capabilities");
    expect(grid.textContent).toContain("remote");
    expect(grid.textContent).toContain("rpc");
    expect(grid.textContent).toContain("polling");
    expect(badgeFor(view, "Storage")).toBe("postgres / server");
    expect(badgeFor(view, "Access")).toBe("reads only");
    expect(view.getByTestId("remote-levers").textContent).toContain(
      READS_ONLY_REASON,
    );
  }, 20_000);

  it("shows the non-operator note in place of every operational tab", async () => {
    const view = remoteApp({ access: null });
    await provisionRemoteReactor(view, "public-switchboard");

    for (const tab of [
      "Queue",
      "Processors",
      "Catch-up",
      "Sync",
      "Attachments",
    ]) {
      fireEvent.click(view.getByRole("button", { name: tab }));
      expect(view.getByTestId("admin-gate-note").textContent).toBe(
        NOT_AN_OPERATOR_REASON,
      );
    }
    expect(view.queryByRole("button", { name: "Pause" })).toBeNull();
  }, 20_000);

  it("sends the bearer so an admin caller reads the operational tabs", async () => {
    const view = remoteApp({ access: null, adminBearer: "admin-token" });
    await provisionRemoteReactor(view, "authed-switchboard", "admin-token");
    expect(badgeFor(view, "Access")).toBe("operator");

    fireEvent.click(view.getByRole("button", { name: "Queue" }));
    await waitFor(
      () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
      WAIT,
    );
    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      READS_ONLY_REASON,
    );
  }, 20_000);

  it("takes a bearer pasted into the note, without re-provisioning", async () => {
    const view = remoteApp({ access: null, adminBearer: "admin-token" });
    await provisionRemoteReactor(view, "late-bearer-switchboard");
    fireEvent.click(view.getByRole("button", { name: "Queue" }));
    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      NOT_AN_OPERATOR_REASON,
    );

    const field = view.getByLabelText("Admin bearer token");
    fireEvent.change(field, { target: { value: "wrong-token" } });
    fireEvent.click(view.getByRole("button", { name: "Use bearer" }));
    await waitFor(
      () =>
        expect(view.getByTestId("operator-bearer-refused").textContent).toBe(
          STILL_NOT_AN_OPERATOR,
        ),
      WAIT,
    );

    fireEvent.change(field, { target: { value: "Bearer admin-token" } });
    fireEvent.click(view.getByRole("button", { name: "Use bearer" }));
    await waitFor(
      () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
      WAIT,
    );
    expect(view.queryByTestId("operator-bearer-form")).toBeNull();
  }, 20_000);

  it("takes a pasted bearer on a remote restored from a saved set", async () => {
    const host: Host = { access: null, adminBearer: "admin-token" };
    const saved = new Map<string, string>();
    const storage = {
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => void saved.set(key, value),
    };
    new MonitoringSetsStore(storage).setActiveDescriptors([
      {
        kind: "remote",
        name: "restored-switchboard",
        remote: { url: "http://switchboard.test/graphql" },
      },
    ]);
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fakeInspectionFetch(host);
    try {
      const view = render(<App store={new MonitoringSetsStore(storage)} />);
      await waitFor(() => expect(view.getByTitle("ready")).toBeTruthy(), WAIT);
      fireEvent.click(view.getByText("restored-switchboard"));
      fireEvent.click(view.getByRole("button", { name: "Queue" }));

      fireEvent.change(view.getByLabelText("Admin bearer token"), {
        target: { value: "admin-token" },
      });
      fireEvent.click(view.getByRole("button", { name: "Use bearer" }));
      await waitFor(
        () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
        WAIT,
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 20_000);

  it("offers a rerun on the Processors tab only where the host serves inspection-admin", async () => {
    const withoutLevers = remoteApp({ access: OPERATOR });
    await provisionRemoteReactor(withoutLevers, "read-only-switchboard");
    fireEvent.click(withoutLevers.getByRole("button", { name: "Processors" }));
    const box = (await waitFor(
      () => withoutLevers.getByLabelText("Select factory:drive:0"),
      WAIT,
    )) as HTMLInputElement;
    expect(withoutLevers.getByTestId("admin-gate-note").textContent).toBe(
      NO_PROCESSOR_LEVERS_REASON,
    );
    expect(box.disabled).toBe(true);
    expect(
      withoutLevers
        .getByRole("button", { name: "Rerun 0 processors" })
        .getAttribute("disabled"),
    ).not.toBeNull();
    withoutLevers.unmount();

    const view = remoteApp({ access: OPERATOR, levers: true });
    await provisionRemoteReactor(view, "admin-switchboard");
    fireEvent.click(view.getByRole("button", { name: "Processors" }));
    fireEvent.click(
      await waitFor(() => view.getByLabelText("Select factory:drive:0"), WAIT),
    );
    expect(view.queryByTestId("admin-gate-note")).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Rerun 1 processor" }));
    fireEvent.click(
      view.getByTestId("rerun-form").querySelector('button[type="submit"]')!,
    );
    await waitFor(
      () =>
        expect(
          view.getByRole("button", { name: "Rerun 0 processors" }),
        ).toBeTruthy(),
      WAIT,
    );
    expect(view.queryByTestId("rerun-form")).toBeNull();
  }, 20_000);

  it("disables the levers and the DB tab for an operator, with the reason", async () => {
    const view = remoteApp({ access: OPERATOR });
    await provisionRemoteReactor(view, "operator-switchboard");
    expect(badgeFor(view, "Access")).toBe("operator");

    fireEvent.click(view.getByRole("button", { name: "Queue" }));
    await waitFor(
      () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
      WAIT,
    );
    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      READS_ONLY_REASON,
    );
    expect(
      view.getByRole("button", { name: "Pause" }).getAttribute("disabled"),
    ).not.toBeNull();

    fireEvent.click(view.getByRole("button", { name: "DB" }));
    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      READS_ONLY_REASON,
    );
    expect(view.queryByLabelText("Schema tree")).toBeNull();

    fireEvent.click(view.getByRole("button", { name: "Sync" }));
    await waitFor(
      () =>
        expect(view.getByTestId("admin-gate-note").textContent).toBe(
          READS_ONLY_REASON,
        ),
      WAIT,
    );
    expect(view.queryByTestId("link-local-sync")).toBeNull();
  }, 20_000);

  it("hides the add-remote form on a remote host that routes gql", async () => {
    const view = remoteApp({ access: OPERATOR, syncChannels: ["gql"] });
    await provisionRemoteReactor(view, "connect-switchboard");

    fireEvent.click(view.getByRole("button", { name: "Sync" }));
    await waitFor(
      () =>
        expect(view.getByTestId("sync-add-remote-remote-host")).toBeTruthy(),
      WAIT,
    );
    expect(view.queryByRole("button", { name: "Add remote" })).toBeNull();
    expect(view.queryByTestId("sync-add-remote-unavailable")).toBeNull();
  }, 20_000);

  it("re-reads the host's info on re-check and re-gates the tabs", async () => {
    const host: Host = { access: null };
    const view = remoteApp(host);
    await provisionRemoteReactor(view, "recheck-switchboard");
    expect(badgeFor(view, "Workflows")).toBe("no");

    host.access = OPERATOR;
    host.workflows = true;
    fireEvent.click(view.getByTestId("remote-recheck"));

    await waitFor(
      () => expect(badgeFor(view, "Access")).toBe("operator"),
      WAIT,
    );
    expect(badgeFor(view, "Workflows")).toBe("yes");

    fireEvent.click(view.getByRole("button", { name: "Queue" }));
    await waitFor(
      () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
      WAIT,
    );
    expect(view.getByTestId("admin-gate-note").textContent).toBe(
      READS_ONLY_REASON,
    );
  }, 20_000);

  it("says why the Events tab is empty rather than hitting a bus that is not there", async () => {
    const view = remoteApp({ access: OPERATOR });
    await provisionRemoteReactor(view, "events-switchboard");

    fireEvent.click(view.getByRole("button", { name: "Events" }));

    expect(view.getByTestId("events-unavailable").textContent).toMatch(
      /not forwarded over the\s+inspection surface/,
    );
  }, 20_000);

  it("never offers a remote reactor as a router backend", async () => {
    const view = remoteApp({ access: OPERATOR });
    await provisionRemoteReactor(view, "router-switchboard");

    fireEvent.click(view.getByRole("button", { name: "Router" }));

    expect(view.getByTestId("router-needs-reactors")).toBeTruthy();
    expect(
      view.queryByTestId("router-backend-option-router-switchboard"),
    ).toBeNull();
  }, 20_000);
});
