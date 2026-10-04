// @vitest-environment happy-dom
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "./App.js";

/**
 * The monitor app against a REMOTE reactor (multi-reactor W3.2): provisioning
 * one from the form, rendering the inspector tabs against it, and -- the point
 * of the admin tiers -- disabling exactly the levers that reactor's host does
 * not serve, with the reason on screen instead of a click that fails.
 *
 * The far side is a stubbed `fetch` over the inspection subgraph's documents.
 * That the real subgraph answers them is
 * `packages/reactor-api/test/inspection-subgraph.test.ts`; that the client
 * speaks them correctly is
 * `packages/reactor-monitor/test/remote-inspection.test.ts`. What is under test
 * here is the UI's reading of the reported facts.
 */

const WAIT = { timeout: 10_000 } as const;

type ServerTiers = { admin: boolean; sql: boolean };

function fakeInspectionFetch(tiers: ServerTiers): typeof fetch {
  const answers = (name: string): unknown => {
    switch (name) {
      case "ReactorInspectionInfo":
        return {
          inspection: {
            info: {
              hosting: "remote",
              inspection: "rpc",
              storageKind: "postgres",
              processors: true,
              workflows: true,
              syncChannels: ["polling"],
              adminEnabled: tiers.admin,
              sqlEnabled: tiers.sql,
            },
          },
        };
      case "ReactorInspectionRemotes":
        return { inspection: { remotes: [] } };
      case "ReactorInspectionStorageHealth":
        return {
          inspection: {
            storageHealth: {
              healthy: true,
              everRecreated: false,
              recreateCount: 0,
              lastRecreated: null,
            },
          },
        };
      case "ReactorInspectionQueueState":
        return {
          inspection: {
            queueState: {
              isPaused: false,
              totalPending: 0,
              totalExecuting: 0,
              pendingJobs: [],
              executingJobs: [],
            },
          },
        };
      case "ReactorInspectionProcessors":
        return { inspection: { processors: [] } };
      case "ReactorInspectionCatchUp":
        return { inspection: { catchUpStatus: { consumers: [] } } };
      default:
        return undefined;
    }
  };

  return (_input, init) => {
    const body = JSON.parse((init?.body as string | undefined) ?? "{}") as {
      query: string;
    };
    const name = /(?:query|mutation)\s+(\w+)/.exec(body.query)?.[1] ?? "";
    const data = answers(name);
    return Promise.resolve(
      data === undefined
        ? Response.json({ errors: [{ message: `no stub for ${name}` }] })
        : Response.json({ data }),
    );
  };
}

function remoteApp(tiers: ServerTiers) {
  const buildDescriptor = ({
    name,
    kind,
    remoteUrl,
  }: {
    name: string;
    kind: ReactorDescriptor["kind"];
    remoteUrl?: string;
  }): ReactorDescriptor => ({
    kind,
    name,
    remote: { url: remoteUrl ?? "", fetch: fakeInspectionFetch(tiers) },
  });
  return render(<App buildDescriptor={buildDescriptor} />);
}

async function provisionRemoteReactor(
  view: ReturnType<typeof remoteApp>,
  name: string,
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
  fireEvent.click(view.getByRole("button", { name: "Provision" }));
  await waitFor(() => expect(view.getByTitle("ready")).toBeTruthy(), WAIT);
}

describe("remote reactor in the monitor app", () => {
  it("requires a URL, because a remote reactor IS its URL", () => {
    const view = remoteApp({ admin: false, sql: false });

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
    const view = remoteApp({ admin: false, sql: false });

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

  it("renders the capability grid from the reactor's own report", async () => {
    const view = remoteApp({ admin: false, sql: false });
    await provisionRemoteReactor(view, "switchboard");

    const grid = view.getByLabelText("Reactor capabilities");
    expect(grid.textContent).toContain("remote");
    // W3.2 raised this from "none": the subgraph is a real transport.
    expect(grid.textContent).toContain("rpc");
    // The far side's real channel type, not the "gql" a URL would suggest.
    expect(grid.textContent).toContain("polling");

    // And the two facts that are the DEPLOYMENT's rather than the reactor's.
    expect(view.getByTestId("remote-admin-enabled").textContent).toMatch(
      /disabled: reads only/,
    );
    expect(view.getByTestId("remote-sql-enabled").textContent).toMatch(
      /disabled: the DB tab is unavailable/,
    );
  }, 20_000);

  it("disables the repair levers and the DB tab on a read-only host, with the reason", async () => {
    const view = remoteApp({ admin: false, sql: false });
    await provisionRemoteReactor(view, "readonly-switchboard");

    fireEvent.click(view.getByRole("button", { name: "Queue" }));
    await waitFor(
      () =>
        expect(view.getByTestId("admin-gate-note").textContent).toMatch(
          /has not set PH_INSPECTION_ADMIN=true/,
        ),
      WAIT,
    );
    expect(
      view.getByRole("button", { name: "Pause" }).getAttribute("disabled"),
    ).not.toBeNull();

    fireEvent.click(view.getByRole("button", { name: "DB" }));
    await waitFor(
      () =>
        expect(view.getByTestId("admin-gate-note").textContent).toMatch(
          /does not serve raw SQL against its store/,
        ),
      WAIT,
    );
    // Nothing of the explorer is rendered: there is no part of it that works
    // without SQL.
    expect(view.queryByLabelText("Schema tree")).toBeNull();

    fireEvent.click(view.getByRole("button", { name: "Sync" }));
    await waitFor(
      () =>
        expect(view.getByTestId("admin-gate-note").textContent).toMatch(
          /every sync repair lever/,
        ),
      WAIT,
    );
    // A remote reactor cannot be handed a MessagePort, so the brokered link
    // panel is absent rather than rendered inert.
    expect(view.queryByTestId("link-local-sync")).toBeNull();
  }, 20_000);

  it("leaves the levers live on a host that opted in, and serves the DB tab", async () => {
    const view = remoteApp({ admin: true, sql: true });
    await provisionRemoteReactor(view, "admin-switchboard");

    expect(view.getByTestId("remote-admin-enabled").textContent).toMatch(
      /enabled: pause\/resume/,
    );

    fireEvent.click(view.getByRole("button", { name: "Queue" }));
    await waitFor(
      () => expect(view.getByText(/Showing \d+ job\(s\)/)).toBeTruthy(),
      WAIT,
    );
    expect(view.queryByTestId("admin-gate-note")).toBeNull();
    expect(
      view.getByRole("button", { name: "Pause" }).getAttribute("disabled"),
    ).toBeNull();
  }, 20_000);

  it("says why the Events tab is empty rather than hitting a bus that is not there", async () => {
    const view = remoteApp({ admin: true, sql: true });
    await provisionRemoteReactor(view, "events-switchboard");

    fireEvent.click(view.getByRole("button", { name: "Events" }));

    expect(view.getByTestId("events-unavailable").textContent).toMatch(
      /not forwarded over the\s+inspection surface/,
    );
  }, 20_000);
});
