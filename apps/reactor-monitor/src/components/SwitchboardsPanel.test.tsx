// @vitest-environment happy-dom
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  isBrowserEnvKey,
  type HostRequest,
  type Instance,
} from "../controller/api.js";
import {
  ControllerRequestError,
  type ControllerClient,
  type HostIssue,
} from "../controller/client.js";
import type { ManagedDescriptors } from "../controller/use-managed-descriptors.js";
import { ADMIN_PRESET, SwitchboardsPanel } from "./SwitchboardsPanel.js";

const POLL = { busy: 10, idle: 20 } as const;
const ROOT = "/work/proj";

function fakeClient(overrides: Partial<ControllerClient> = {}) {
  const instances = new Map<string, Instance>();
  const started: HostRequest[] = [];
  let n = 0;
  const client: ControllerClient = {
    projects: () => Promise.resolve([{ root: ROOT, name: "proj" }]),
    hosts: () => Promise.resolve(["sb", "other"]),
    check: () => Promise.resolve([]),
    start: (request) => {
      started.push(request);
      const instance: Instance = {
        id: `inst-${++n}`,
        project: request.project,
        host: request.host,
        status: "starting",
        startedAt: new Date().toISOString(),
      };
      instances.set(instance.id, instance);
      return Promise.resolve(structuredClone(instance));
    },
    list: () =>
      Promise.resolve([...instances.values()].map((i) => structuredClone(i))),
    get: (id) => {
      const instance = instances.get(id);
      return instance
        ? Promise.resolve(structuredClone(instance))
        : Promise.reject(new ControllerRequestError("not_found", "gone", 404));
    },
    logs: () =>
      Promise.resolve({
        next: 2,
        lines: [
          { seq: 0, stream: "stdout", text: "booting" },
          { seq: 1, stream: "stdout", text: "listening" },
        ],
      }),
    stop: (id) => {
      const instance = instances.get(id);
      instances.delete(id);
      return Promise.resolve(instance && { ...instance, status: "exited" });
    },
    stopAll: () => {
      const all = [...instances.values()];
      instances.clear();
      return Promise.resolve(all);
    },
    capabilities: () => Promise.reject(new Error("unused")),
    exportHost: () => Promise.reject(new Error("unused")),
    checkDraft: () => Promise.reject(new Error("unused")),
    startDraft: () => Promise.reject(new Error("unused")),
    ...overrides,
  };
  const run = (id: string) => {
    const instance = instances.get(id)!;
    instance.status = "running";
    instance.pid = 4242;
    instance.outputs = {
      origin: "http://127.0.0.1:5555",
      graphql: "http://127.0.0.1:5555/graphql",
      drives: {
        powerhouse: {
          id: "powerhouse",
          url: "http://127.0.0.1:5555/d/powerhouse",
        },
      },
    };
  };
  return { client, instances, started, run };
}

function fakeManaged(
  client: ControllerClient | undefined,
  overrides: Partial<ManagedDescriptors> = {},
): ManagedDescriptors {
  return {
    client,
    visible: [],
    withheld: [],
    attachedIds: new Set(),
    owned: new Map(),
    reactors: new Map(),
    notices: [],
    dismissNotice: vi.fn(),
    attach: vi.fn(),
    kill: vi.fn(),
    stopInstance: vi.fn(async (id: string) => {
      await client?.stop(id);
    }),
    dropInstance: vi.fn(),
    stopAll: vi.fn(async () => {
      await client?.stopAll();
    }),
    reconcile: vi.fn(),
    forget: vi.fn(),
    ...overrides,
  };
}

async function ready(view: ReturnType<typeof render>) {
  await waitFor(() =>
    expect((view.getByLabelText("Host") as HTMLSelectElement).value).toBe("sb"),
  );
}

describe("SwitchboardsPanel", () => {
  it("degrades without a controller and lets withheld descriptors be forgotten", () => {
    const managed = fakeManaged(undefined, {
      withheld: [
        {
          name: "sb-1234",
          managedBy: { instanceId: "x", project: ROOT, host: "sb" },
          reason: "no controller on this page",
        },
      ],
    });
    const view = render(<SwitchboardsPanel managed={managed} />);
    expect(view.getByTestId("switchboards-no-controller")).toBeTruthy();
    expect(view.queryByRole("button", { name: "Start" })).toBeNull();
    const withheld = view.getByTestId("switchboards-withheld");
    expect(withheld.textContent).toMatch(/no controller on this page/);
    fireEvent.click(within(withheld).getByRole("button", { name: "Forget" }));
    expect(managed.forget).toHaveBeenCalledWith("sb-1234");
  });

  it("leads a failed start with its reason and keeps the log tail folded", async () => {
    const { client, instances } = fakeClient();
    instances.set("dead", {
      id: "dead",
      project: ROOT,
      host: "sb",
      status: "failed",
      startedAt: new Date().toISOString(),
      error: {
        phase: "exited",
        message: "ph run sb exited (code 1) before writing its run record.",
        tail: "Port 16347 is already in use\nmemory allocation of 64 bytes failed",
      },
    });
    const view = render(
      <SwitchboardsPanel managed={fakeManaged(client)} pollMs={POLL} />,
    );
    const reason = await view.findByText(
      "exited: ph run sb exited (code 1) before writing its run record.",
    );
    const tail = view.getByText(/memory allocation of 64 bytes failed/);
    const folded = tail.closest("details");
    expect(folded).toBeTruthy();
    expect(folded?.open).toBe(false);
    expect(
      reason.compareDocumentPosition(folded!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("keeps the admin preset on the browser env allowlist", () => {
    for (const { key } of ADMIN_PRESET) expect(isBrowserEnvKey(key)).toBe(true);
  });

  it("refuses env keys off the allowlist before sending, and shows the server's refusal", async () => {
    const { client } = fakeClient({
      check: () =>
        Promise.reject(
          new ControllerRequestError(
            "env_denied",
            "Not on the browser env allowlist: REACTOR_LOADER.",
            400,
          ),
        ),
    });
    const view = render(
      <SwitchboardsPanel managed={fakeManaged(client)} pollMs={POLL} />,
    );
    await ready(view);

    fireEvent.click(view.getByRole("button", { name: "Add env" }));
    fireEvent.change(view.getByLabelText("Env key"), {
      target: { value: "NODE_OPTIONS" },
    });
    expect(
      view.getByText("NODE_OPTIONS: not on the browser env allowlist"),
    ).toBeTruthy();
    expect(
      (view.getByRole("button", { name: "Check" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(
      (view.getByRole("button", { name: "Start" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);

    fireEvent.change(view.getByLabelText("Env key"), {
      target: { value: "LOG_LEVEL" },
    });
    expect(view.queryByText(/not on the browser env allowlist/)).toBeNull();
    fireEvent.click(view.getByRole("button", { name: "Check" }));
    await waitFor(() =>
      expect(view.getByTestId("switchboards-error").textContent).toBe(
        "Not on the browser env allowlist: REACTOR_LOADER.",
      ),
    );
  });

  it("checks a host with the env map and lists issues by path", async () => {
    const issues: HostIssue[] = [
      {
        stage: "resolve",
        file: "hosts/sb/host.js",
        path: "runner.port",
        message: "MONITOR_PORT is not set",
        hint: "set it in the env",
      },
    ];
    const check = vi.fn((_request: HostRequest) => Promise.resolve(issues));
    const { client } = fakeClient({ check });
    const view = render(
      <SwitchboardsPanel managed={fakeManaged(client)} pollMs={POLL} />,
    );
    await ready(view);
    fireEvent.click(view.getByRole("button", { name: "Admin preset" }));
    expect(view.getByText("ADMINS: needs an admin address")).toBeTruthy();
    expect(
      (view.getByRole("button", { name: "Check" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    fireEvent.change(view.getByLabelText("Value of ADMINS"), {
      target: { value: "0xabc" },
    });
    fireEvent.click(view.getByRole("button", { name: "Check" }));

    const table = await view.findByTestId("switchboards-issues");
    expect(table.textContent).toMatch(/resolve/);
    expect(within(table).getByText("runner.port")).toBeTruthy();
    expect(table.textContent).toMatch(/MONITOR_PORT is not set/);
    expect(table.textContent).toMatch(/set it in the env/);
    expect(check).toHaveBeenCalledWith({
      project: ROOT,
      host: "sb",
      env: {
        INSPECTION_ADMIN_ENABLED: "true",
        AUTH_ENABLED: "true",
        ADMINS: "0xabc",
      },
    });
  });

  it("shows a refused start's check issues", async () => {
    const issue: HostIssue = {
      stage: "boot",
      file: "hosts/sb/host.js",
      path: "reactor.backends.main",
      message: "workers need postgres",
    };
    const { client } = fakeClient({
      start: () =>
        Promise.reject(
          new ControllerRequestError("check_failed", "failed its check", 422, [
            issue,
          ]),
        ),
    });
    const view = render(
      <SwitchboardsPanel managed={fakeManaged(client)} pollMs={POLL} />,
    );
    await ready(view);
    fireEvent.click(view.getByRole("button", { name: "Start" }));
    const table = await view.findByTestId("switchboards-issues");
    expect(within(table).getByText("reactor.backends.main")).toBeTruthy();
    expect(view.getByTestId("switchboards-error").textContent).toBe(
      "failed its check",
    );
  });

  it("attaches a started instance once it is running, shows its logs, and stops it", async () => {
    const fake = fakeClient();
    const managed = fakeManaged(fake.client);
    const view = render(<SwitchboardsPanel managed={managed} pollMs={POLL} />);
    await ready(view);

    fireEvent.click(view.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(fake.started).toHaveLength(1));
    const row = await view.findByTestId("switchboard-inst-1");
    expect(row.textContent).toMatch(/starting/);
    expect(managed.attach).not.toHaveBeenCalled();

    fake.run("inst-1");
    await waitFor(() => expect(managed.attach).toHaveBeenCalledTimes(1));
    expect(vi.mocked(managed.attach).mock.calls[0][0]).toMatchObject({
      id: "inst-1",
      status: "running",
    });
    await waitFor(() =>
      expect(row.textContent).toMatch(/http:\/\/127\.0\.0\.1:5555\/graphql/),
    );
    expect(row.textContent).toMatch(/drive powerhouse/);
    expect(managed.reconcile).toHaveBeenCalled();

    fireEvent.click(within(row).getByRole("button", { name: "Logs" }));
    await waitFor(() =>
      expect(view.getByTestId("switchboard-logs").textContent).toMatch(
        /listening/,
      ),
    );

    fireEvent.click(within(row).getByRole("button", { name: "Stop" }));
    await waitFor(() =>
      expect(managed.stopInstance).toHaveBeenCalledWith("inst-1"),
    );
    await waitFor(() =>
      expect(view.queryByTestId("switchboard-inst-1")).toBeNull(),
    );
    expect(managed.attach).toHaveBeenCalledTimes(1);
  });

  it("defaults to the first project that has hosts", async () => {
    const { client } = fakeClient({
      projects: () =>
        Promise.resolve([
          { root: "/work", name: "work" },
          { root: ROOT, name: "proj" },
        ]),
      hosts: (project) => Promise.resolve(project === ROOT ? ["sb"] : []),
    });
    const view = render(
      <SwitchboardsPanel managed={fakeManaged(client)} pollMs={POLL} />,
    );
    await ready(view);
    expect((view.getByLabelText("Project") as HTMLSelectElement).value).toBe(
      ROOT,
    );
    fireEvent.change(view.getByLabelText("Project"), {
      target: { value: "/work" },
    });
    await view.findByText("This project has no hosts/<name>/host.js.");
  });

  it("stops polling once the controller refuses the token", async () => {
    const list = vi.fn(() =>
      Promise.reject(
        new ControllerRequestError(
          "bad_token",
          "Wrong token. The controller restarted; reload the page.",
          401,
        ),
      ),
    );
    const { client } = fakeClient({ list });
    const view = render(
      <SwitchboardsPanel managed={fakeManaged(client)} pollMs={POLL} />,
    );
    await view.findByText(/reload the page/);
    await new Promise((resolve) => setTimeout(resolve, 10 * POLL.idle));
    expect(list).toHaveBeenCalledTimes(1);
  });

  it("offers to start the host an imported set came from", async () => {
    const fake = fakeClient();
    const view = render(
      <SwitchboardsPanel
        managed={fakeManaged(fake.client)}
        pollMs={POLL}
        source={{
          project: { name: "other", root: "/elsewhere/other" },
          host: "cli",
        }}
      />,
    );
    await ready(view);
    fireEvent.click(view.getByRole("button", { name: "Start this host" }));
    await waitFor(() =>
      expect(fake.started).toEqual([
        { project: "/elsewhere/other", host: "cli", env: {} },
      ]),
    );
  });
});
