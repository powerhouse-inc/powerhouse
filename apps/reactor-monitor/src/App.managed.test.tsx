// @vitest-environment happy-dom
import {
  cleanup,
  fireEvent,
  render,
  waitFor,
  within,
} from "@testing-library/react";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";
import {
  CONTROLLER_PREFIX,
  TOKEN_HEADER,
  TOKEN_META_NAME,
  type Instance,
} from "./controller/api.js";
import { managedByOf } from "./controller/managed.js";
import { MonitoringSetsStore } from "./monitoring-sets.js";
import { REMOTE_BEARER_KEY_PREFIX } from "./provisioning.js";

const TOKEN = "test-token";
const ROOT = "/work/proj";
const WAIT = { timeout: 10_000 } as const;

function freshStore(): MonitoringSetsStore {
  const cells = new Map<string, string>();
  return new MonitoringSetsStore({
    getItem: (key) => cells.get(key) ?? null,
    setItem: (key, value) => {
      cells.set(key, value);
    },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const notFound = () =>
  json(404, { error: { code: "not_found", message: "No instance." } });

function graphqlOf(port: number) {
  return `http://127.0.0.1:${port}/graphql`;
}

function driveOf(port: number) {
  return `http://127.0.0.1:${port}/d/powerhouse`;
}

function instance(
  id: string,
  status: Instance["status"],
  port?: number,
): Instance {
  return {
    id,
    project: ROOT,
    host: "sb",
    status,
    startedAt: "2026-10-26T00:00:00.000Z",
    ...(port
      ? {
          pid: 4000 + port,
          outputs: {
            origin: `http://127.0.0.1:${port}`,
            graphql: graphqlOf(port),
            drives: { powerhouse: { id: "powerhouse", url: driveOf(port) } },
          },
        }
      : {}),
  };
}

function compound(
  id: string,
  status: Instance["status"],
  ports: Record<string, number>,
): Instance {
  return {
    ...instance(id, status),
    host: "duo",
    members: Object.fromEntries(
      Object.entries(ports).map(([member, port]) => [
        member,
        {
          host: `sb-${member}`,
          outputs: {
            origin: `http://127.0.0.1:${port}`,
            graphql: graphqlOf(port),
            drives: { powerhouse: { id: "powerhouse", url: driveOf(port) } },
          },
        },
      ]),
    ),
  };
}

/** An in-memory controller behind the page's fetch; other URLs refuse fast. */
function fakeController() {
  const instances = new Map<string, Instance>();
  const calls: string[] = [];
  let gate: Promise<void> = Promise.resolve();
  let deleteAnswers404 = false;
  let nextId = 1;

  const handle = async (url: string, init: RequestInit): Promise<Response> => {
    const method = init.method ?? "GET";
    const path = url.slice(CONTROLLER_PREFIX.length);
    calls.push(`${method} ${path}`);
    const headers = init.headers as Record<string, string>;
    if (headers[TOKEN_HEADER] !== TOKEN) {
      return json(401, { error: { code: "bad_token", message: "token" } });
    }
    if (path === "projects") {
      return json(200, { projects: [{ root: ROOT, name: "proj" }] });
    }
    if (path.startsWith("hosts?")) return json(200, { hosts: ["sb"] });
    if (path === "instances" && method === "GET") {
      return json(200, { instances: [...instances.values()] });
    }
    if (path === "instances" && method === "POST") {
      const id = `${String(nextId++).padStart(8, "0")}-0000-4000-8000-000000000000`;
      const started = instance(id, "starting");
      instances.set(id, started);
      return json(202, started);
    }
    const match = /^instances\/([^/?]+)$/.exec(path);
    if (match) {
      const id = decodeURIComponent(match[1]);
      if (method === "GET") {
        await gate;
        const found = instances.get(id);
        return found ? json(200, found) : notFound();
      }
      if (method === "DELETE") {
        const found = instances.get(id);
        instances.delete(id);
        if (!found || deleteAnswers404) return notFound();
        return json(200, { ...found, status: "exited" });
      }
    }
    if (/^instances\/[^/]+\/logs/.test(path)) {
      return json(200, { next: 0, lines: [] });
    }
    return notFound();
  };

  const fetchStub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url.startsWith(CONTROLLER_PREFIX)) return handle(url, init ?? {});
    calls.push(`NET ${url}`);
    return Promise.reject(new TypeError(`no network in this test: ${url}`));
  });

  return {
    instances,
    calls,
    fetchStub,
    hold: () => {
      let open!: () => void;
      gate = new Promise<void>((resolve) => {
        open = resolve;
      });
      return open;
    },
    answerDeleteWith404: () => {
      deleteAnswers404 = true;
    },
  };
}

function mountController(): void {
  const meta = document.createElement("meta");
  meta.name = TOKEN_META_NAME;
  meta.content = TOKEN;
  document.head.append(meta);
}

function managedDescriptor(
  name: string,
  instanceId: string,
  port: number,
): ReactorDescriptor {
  return {
    kind: "remote",
    name,
    remote: { url: driveOf(port) },
    managedBy: { instanceId, project: ROOT, host: "sb" },
  } as ReactorDescriptor;
}

function storeWith(...descriptors: ReactorDescriptor[]): MonitoringSetsStore {
  const store = freshStore();
  store.setActiveDescriptors(descriptors);
  return store;
}

const bearerOf = (port: number) =>
  window.sessionStorage.getItem(REMOTE_BEARER_KEY_PREFIX + graphqlOf(port));

const reactorList = (view: ReturnType<typeof render>) =>
  view.getByLabelText("Reactor list");

describe("App with controller-managed switchboards", () => {
  let controller: ReturnType<typeof fakeController>;

  beforeEach(() => {
    controller = fakeController();
    vi.stubGlobal("fetch", controller.fetchStub);
    // A remote that refuses to attach is logged by App's onError.
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    // Unmount while fetch is still the stub, so no poll reaches the network.
    cleanup();
    document.head
      .querySelectorAll(`meta[name="${TOKEN_META_NAME}"]`)
      .forEach((meta) => meta.remove());
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("attaches a started switchboard and stops it on kill, taking a 404 as already gone", async () => {
    mountController();
    const store = freshStore();
    const view = render(<App store={store} />);
    const panel = view.getByLabelText("Switchboards");
    await waitFor(() =>
      expect(
        (within(panel).getByLabelText("Host") as HTMLSelectElement).value,
      ).toBe("sb"),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(controller.instances.size).toBe(1));
    const [id] = controller.instances.keys();
    controller.instances.set(id, instance(id, "running", 5101));

    const name = `sb-${id.slice(0, 8)}`;
    await waitFor(
      () => expect(within(reactorList(view)).getByText(name)).toBeTruthy(),
      WAIT,
    );
    expect(store.getActiveDescriptors()).toEqual([
      {
        kind: "remote",
        name,
        remote: { url: driveOf(5101) },
        managedBy: { instanceId: id, project: ROOT, host: "sb" },
      },
    ]);

    window.sessionStorage.setItem(
      REMOTE_BEARER_KEY_PREFIX + graphqlOf(5101),
      "admin-token",
    );
    controller.answerDeleteWith404();
    const item = within(reactorList(view)).getByText(name).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Kill" }));
    await waitFor(() =>
      expect(controller.calls).toContain(
        `DELETE instances/${encodeURIComponent(id)}`,
      ),
    );
    await waitFor(() =>
      expect(within(reactorList(view)).queryByText(name)).toBeNull(),
    );
    expect(store.getActiveDescriptors()).toEqual([]);
    expect(view.queryByTestId("switchboards-notices")).toBeNull();
    expect(bearerOf(5101)).toBeNull();
  });

  it("attaches every member of a compound, and kill stops it and drops them all", async () => {
    mountController();
    const store = freshStore();
    const view = render(<App store={store} />);
    const panel = view.getByLabelText("Switchboards");
    await waitFor(() =>
      expect(
        (within(panel).getByLabelText("Host") as HTMLSelectElement).value,
      ).toBe("sb"),
    );

    fireEvent.click(within(panel).getByRole("button", { name: "Start" }));
    await waitFor(() => expect(controller.instances.size).toBe(1));
    const [id] = controller.instances.keys();
    controller.instances.set(id, compound(id, "running", { a: 5301, b: 5302 }));

    const names = [`a-${id.slice(0, 8)}`, `b-${id.slice(0, 8)}`];
    await waitFor(() => {
      for (const name of names) {
        expect(within(reactorList(view)).getByText(name)).toBeTruthy();
      }
    }, WAIT);
    expect(
      store
        .getActiveDescriptors()
        .map((d) => [d.name, d.remote?.url, managedByOf(d)?.member]),
    ).toEqual([
      [names[0], driveOf(5301), "a"],
      [names[1], driveOf(5302), "b"],
    ]);

    const item = within(reactorList(view)).getByText(names[0]).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Kill" }));
    await waitFor(() =>
      expect(controller.calls).toContain(
        `DELETE instances/${encodeURIComponent(id)}`,
      ),
    );
    await waitFor(() => expect(store.getActiveDescriptors()).toEqual([]));
    expect(view.queryByTestId("switchboards-notices")).toBeNull();
  });

  it("probes a rehydrated member descriptor against its own member's URL", async () => {
    mountController();
    controller.instances.set(
      "duo",
      compound("duo", "running", { a: 5311, b: 5399 }),
    );
    const member = (name: string, key: string, port: number) =>
      ({
        ...managedDescriptor(name, "duo", port),
        managedBy: {
          instanceId: "duo",
          project: ROOT,
          host: "duo",
          member: key,
        },
      }) as ReactorDescriptor;
    const store = storeWith(
      member("a-duo", "a", 5311),
      member("b-duo", "b", 5312),
    );
    const view = render(<App store={store} />);

    await waitFor(
      () => expect(within(reactorList(view)).getByText("a-duo")).toBeTruthy(),
      WAIT,
    );
    await waitFor(() =>
      expect(store.getActiveDescriptors().map((d) => d.name)).toEqual([
        "a-duo",
      ]),
    );
    expect(view.getByTestId("switchboards-notices").textContent).toMatch(
      /b-duo: its switchboard now serves another URL/,
    );
  });

  it("withholds a rehydrated managed descriptor until the controller confirms it", async () => {
    mountController();
    controller.instances.set("live", instance("live", "running", 5102));
    const open = controller.hold();
    const view = render(
      <App store={storeWith(managedDescriptor("sb-live", "live", 5102))} />,
    );

    expect(within(reactorList(view)).queryByText("sb-live")).toBeNull();
    expect(view.getByTestId("switchboards-withheld").textContent).toMatch(
      /sb-live/,
    );
    await waitFor(() =>
      expect(controller.calls).toContain("GET instances/live"),
    );
    expect(controller.calls.filter((call) => call.startsWith("NET "))).toEqual(
      [],
    );
    open();
    await waitFor(
      () => expect(within(reactorList(view)).getByText("sb-live")).toBeTruthy(),
      WAIT,
    );
    expect(view.queryByTestId("switchboards-withheld")).toBeNull();
    expect(controller.calls).toContain(`NET ${graphqlOf(5102)}/inspection`);
  });

  it("re-probes a managed descriptor whose probe answered after its set was switched away", async () => {
    mountController();
    const store = storeWith(managedDescriptor("sb-away", "away", 5109));
    store.importSet("other", []);
    const open = controller.hold();
    const view = render(<App store={store} />);
    await waitFor(() =>
      expect(controller.calls).toContain("GET instances/away"),
    );

    const sets = view.getByTestId("monitor-set-select");
    fireEvent.change(sets, { target: { value: "other" } });
    open();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(view.queryByTestId("switchboards-notices")).toBeNull();

    fireEvent.change(sets, { target: { value: "default" } });
    await waitFor(() =>
      expect(
        controller.calls.filter((call) => call === "GET instances/away"),
      ).toHaveLength(2),
    );
    await waitFor(() => expect(store.getActiveDescriptors()).toEqual([]));
    expect(view.getByTestId("switchboards-notices").textContent).toMatch(
      /sb-away: the controller no longer runs it/,
    );
  });

  it("drops rehydrated managed descriptors whose switchboard is gone, exited or moved", async () => {
    mountController();
    controller.instances.set("done", instance("done", "exited"));
    controller.instances.set("moved", instance("moved", "running", 5199));
    const store = storeWith(
      managedDescriptor("sb-gone", "gone", 5103),
      managedDescriptor("sb-done", "done", 5104),
      managedDescriptor("sb-moved", "moved", 5105),
      { kind: "remote", name: "plain", remote: { url: driveOf(5106) } },
    );
    const view = render(<App store={store} />);

    await waitFor(
      () =>
        expect(store.getActiveDescriptors().map((d) => d.name)).toEqual([
          "plain",
        ]),
      WAIT,
    );
    const notices = view.getByTestId("switchboards-notices").textContent;
    expect(notices).toMatch(/sb-gone: the controller no longer runs it/);
    expect(notices).toMatch(/sb-done: its switchboard is exited/);
    expect(notices).toMatch(/sb-moved: its switchboard now serves another URL/);
    expect(within(reactorList(view)).getByText("plain")).toBeTruthy();
  });

  it("keeps managed descriptors withheld without a controller, until forgotten", () => {
    const store = storeWith(managedDescriptor("sb-x", "x", 5107));
    const view = render(<App store={store} />);

    expect(view.getByTestId("switchboards-no-controller")).toBeTruthy();
    expect(within(reactorList(view)).queryByText("sb-x")).toBeNull();
    const withheld = view.getByTestId("switchboards-withheld");
    expect(withheld.textContent).toMatch(/no controller on this page/);
    expect(store.getActiveDescriptors()).toHaveLength(1);
    expect(controller.calls).toEqual([]);

    fireEvent.click(within(withheld).getByRole("button", { name: "Forget" }));
    expect(store.getActiveDescriptors()).toEqual([]);
  });

  it("drops an attached switchboard once the controller reports it exited", async () => {
    mountController();
    controller.instances.set("run", instance("run", "running", 5108));
    const store = storeWith(managedDescriptor("sb-run", "run", 5108));
    const view = render(<App store={store} />);
    await waitFor(
      () => expect(within(reactorList(view)).getByText("sb-run")).toBeTruthy(),
      WAIT,
    );

    window.sessionStorage.setItem(
      REMOTE_BEARER_KEY_PREFIX + graphqlOf(5108),
      "admin-token",
    );
    controller.instances.set("run", instance("run", "exited"));
    await waitFor(
      () => expect(within(reactorList(view)).queryByText("sb-run")).toBeNull(),
      WAIT,
    );
    expect(store.getActiveDescriptors()).toEqual([]);
    expect(view.getByTestId("switchboards-notices").textContent).toMatch(
      /sb-run: its switchboard exited/,
    );
    expect(bearerOf(5108)).toBeNull();
  });

  it("re-probes a released managed descriptor when its set is switched back to", async () => {
    mountController();
    controller.instances.set("back", instance("back", "running", 5110));
    const store = storeWith(managedDescriptor("sb-back", "back", 5110));
    store.importSet("other", []);
    const view = render(<App store={store} />);
    await waitFor(
      () => expect(within(reactorList(view)).getByText("sb-back")).toBeTruthy(),
      WAIT,
    );
    const sets = view.getByTestId("monitor-set-select");
    fireEvent.change(sets, { target: { value: "other" } });
    await waitFor(() =>
      expect(within(reactorList(view)).queryByText("sb-back")).toBeNull(),
    );

    controller.instances.set("back", instance("back", "exited"));
    const inspection = `NET ${graphqlOf(5110)}/inspection`;
    const attachesBefore = controller.calls.filter((c) => c === inspection);
    fireEvent.change(sets, { target: { value: "default" } });
    expect(within(reactorList(view)).queryByText("sb-back")).toBeNull();
    await waitFor(() =>
      expect(view.getByTestId("switchboards-notices").textContent).toMatch(
        /sb-back: its switchboard is exited/,
      ),
    );
    expect(store.getActiveDescriptors()).toEqual([]);
    expect(controller.calls.filter((c) => c === inspection)).toEqual(
      attachesBefore,
    );
  });
});
