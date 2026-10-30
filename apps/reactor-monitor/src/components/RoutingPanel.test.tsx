// @vitest-environment happy-dom
import { fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  ReactorMonitorRegistry,
  type ReactorDescriptor,
} from "@powerhousedao/reactor-monitor";
import { ReactorMonitorProvider } from "@powerhousedao/reactor-monitor/react";
import type {
  RouterTableSnapshot,
  RoutingReactorClient,
} from "@powerhousedao/reactor-router";
import { PLACEMENTS_STORAGE_KEY } from "../lib/placements.js";
import type { RouteSeed } from "../lib/route-seed.js";
import type * as RouterModule from "../lib/router.js";
import { RoutingPanel, type RoutingPanelProps } from "./RoutingPanel.js";

const builds = vi.hoisted(() => [] as unknown[][]);
vi.mock("../lib/router.js", async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return {
    ...actual,
    buildRoutingClient: (
      ...args: Parameters<typeof actual.buildRoutingClient>
    ) => {
      builds.push(args);
      return actual.buildRoutingClient(...args);
    },
  };
});

function memoryStorage(): Pick<Storage, "getItem" | "setItem"> {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  };
}

// Each in-process reactor boots a whole PGlite (WASM + migrations); the same
// allowance the rest of this app's suite makes.
const WAIT = { timeout: 30_000 } as const;

/** In-memory, in-process: leaves nothing behind, and needs no browser store. */
function memoryDescriptor(name: string): ReactorDescriptor {
  return { kind: "in-process", name, storage: { kind: "memory" } };
}

const ALPHA = "router-alpha";
const BETA = "router-beta";
const descriptors = [memoryDescriptor(ALPHA), memoryDescriptor(BETA)];

/**
 * Two real in-process reactors behind one shared registry, each holding one
 * drive created directly on it -- the realistic starting point for a router: a
 * topology it did not create, whose drive ids are only knowable after the fact
 * (the reference DriveClient mints them).
 */
describe("RoutingPanel over two in-process backends", () => {
  let registry: ReactorMonitorRegistry;
  let driveA = "";
  let driveB = "";

  function renderPanel(props: RoutingPanelProps = {}) {
    // The registry is passed AND the descriptors name the already-provisioned
    // reactors, so the provider keeps them (does not re-provision, does not
    // reconcile them away) and does not kill them when a test unmounts.
    return render(
      <ReactorMonitorProvider descriptors={descriptors} registry={registry}>
        <RoutingPanel storage={memoryStorage()} {...props} />
      </ReactorMonitorProvider>,
    );
  }

  function routerHandle(): { describeRouting?: () => RouterTableSnapshot } {
    const win = window as unknown as {
      __reactorMonitor?: {
        router?: { describeRouting?: () => RouterTableSnapshot };
      };
    };
    return win.__reactorMonitor?.router ?? {};
  }

  async function build(view: ReturnType<typeof renderPanel>): Promise<void> {
    await waitFor(
      () =>
        expect(view.getByTestId(`router-backend-option-${ALPHA}`)).toBeTruthy(),
      WAIT,
    );
    fireEvent.click(view.getByTestId(`router-backend-option-${ALPHA}`));
    fireEvent.click(view.getByTestId(`router-backend-option-${BETA}`));
    fireEvent.click(view.getByTestId("router-build"));
    await waitFor(() => expect(view.getByTestId("router-table")).toBeTruthy());
  }

  beforeAll(async () => {
    registry = new ReactorMonitorRegistry();
    const alpha = await registry.provision(descriptors[0]);
    const beta = await registry.provision(descriptors[1]);
    const createdA = await alpha.client.drives.create({
      global: { name: "Alpha" },
    });
    const createdB = await beta.client.drives.create({
      global: { name: "Beta" },
    });
    driveA = createdA.header.id;
    driveB = createdB.header.id;
  }, 60_000);

  afterAll(async () => {
    await registry.killAll();
  });

  it("builds a router, creates a drive through it, and renders a describeRouting row plus the dev handle", async () => {
    const view = renderPanel();
    await build(view);

    // Both backends, with their capability summaries.
    expect(view.getByTestId(`router-backend-${ALPHA}`)).toBeTruthy();
    expect(view.getByTestId(`router-backend-${BETA}`)).toBeTruthy();

    // Create a drive THROUGH the router; it records the owner, so a routing
    // row appears.
    fireEvent.change(view.getByTestId("router-create-drive-name"), {
      target: { value: "ViaRouter" },
    });
    fireEvent.click(view.getByTestId("router-create-drive"));

    await waitFor(
      () => expect(view.getByTestId("router-create-result")).toBeTruthy(),
      WAIT,
    );
    const rows = view
      .getByTestId("router-table")
      .querySelectorAll('[data-testid^="router-route-"]');
    expect(rows.length).toBeGreaterThanOrEqual(1);

    // The dev-only scripting handle is live and describes the topology.
    const handle = routerHandle();
    expect(handle.describeRouting).toBeTypeOf("function");
    expect([...(handle.describeRouting?.().backends ?? [])].sort()).toEqual(
      [ALPHA, BETA].sort(),
    );
  }, 60_000);

  it("shows a moved drive on the table with the override evidence badge", async () => {
    const view = renderPanel();
    await build(view);

    fireEvent.change(view.getByTestId("router-move-key"), {
      target: { value: driveA },
    });
    fireEvent.change(view.getByTestId("router-move-backend"), {
      target: { value: ALPHA },
    });
    fireEvent.click(view.getByTestId("router-move"));

    await waitFor(
      () => expect(view.getByTestId(`router-route-${driveA}`)).toBeTruthy(),
      WAIT,
    );
    const row = view.getByTestId(`router-route-${driveA}`);
    expect(within(row).getByTestId("router-source").textContent).toBe(
      "override",
    );
    expect(within(row).getByText(ALPHA)).toBeTruthy();
  }, 60_000);

  it("corrects a stale override through the ownership guard on a write", async () => {
    const view = renderPanel();
    await build(view);

    fireEvent.change(view.getByTestId("router-move-key"), {
      target: { value: driveA },
    });
    fireEvent.change(view.getByTestId("router-move-backend"), {
      target: { value: BETA },
    });
    fireEvent.click(view.getByTestId("router-move"));
    await waitFor(() =>
      expect(view.getByTestId("router-log-empty")).toBeTruthy(),
    );

    const router = routerHandle() as {
      drives?: {
        addFolder: (driveId: string, name: string) => Promise<unknown>;
      };
      describeRouting?: () => RouterTableSnapshot;
    };
    await router.drives?.addFolder(driveA, "Via a stale override");

    const route = router
      .describeRouting?.()
      .collections.find(
        (entry) => entry.collectionId === `drive.main.${driveA}`,
      );
    expect(route).toMatchObject({ backend: ALPHA, source: "corrected" });
    await waitFor(
      () =>
        expect(view.getByTestId("router-log").textContent).toMatch(
          /placement is stale/,
        ),
      WAIT,
    );
  }, 60_000);

  it("merges a find across both backends and names which one answered", async () => {
    const view = renderPanel();
    await build(view);

    // The default type is the drive document type; both drives match.
    fireEvent.click(view.getByTestId("router-find"));

    await waitFor(
      () => expect(view.getByTestId("router-find-results")).toBeTruthy(),
      WAIT,
    );
    const hitA = await waitFor(
      () => view.getByTestId(`router-find-hit-${driveA}`),
      WAIT,
    );
    const hitB = view.getByTestId(`router-find-hit-${driveB}`);
    // Each hit names the backend that actually serves it: the merge carries
    // both reactors' drives, and provenance is right.
    expect(within(hitA).getByText(ALPHA)).toBeTruthy();
    expect(within(hitB).getByText(BETA)).toBeTruthy();
  }, 60_000);

  it("refuses a cross-backend batch with its named error", async () => {
    const view = renderPanel();
    await build(view);

    fireEvent.change(view.getByTestId("router-constraint-a"), {
      target: { value: driveA },
    });
    fireEvent.change(view.getByTestId("router-constraint-b"), {
      target: { value: driveB },
    });
    fireEvent.click(view.getByTestId("router-batch"));

    await waitFor(
      () =>
        expect(view.getByTestId("router-batch-error").textContent).toMatch(
          /CrossBackendBatchError/,
        ),
      WAIT,
    );
  }, 60_000);
});

describe("RoutingPanel moves", () => {
  let registry: ReactorMonitorRegistry;
  let driveA = "";

  // A second switchboard handle: the same host backend after a new Start.
  const GAMMA = "router-gamma";
  const three = [...descriptors, memoryDescriptor(GAMMA)];

  beforeAll(async () => {
    registry = new ReactorMonitorRegistry();
    const alpha = await registry.provision(three[0]);
    await registry.provision(three[1]);
    await registry.provision(three[2]);
    driveA = (await alpha.client.drives.create({ global: { name: "Alpha" } }))
      .header.id;
  }, 90_000);

  afterAll(async () => {
    await registry.killAll();
  });

  function seedOf(
    id: string,
    collections: Record<string, string>,
    switchboard = BETA,
  ): RouteSeed {
    return {
      id,
      app: "app",
      member: "host.children.app",
      instanceId: "i-1",
      source: { project: "/p", host: "web" },
      context: { controller: true, postgres: false },
      backends: [
        { reactor: ALPHA, backend: "main" },
        { reactor: switchboard, backend: "sb" },
      ],
      collections,
      drives: { [driveA]: "alpha" },
      router: { defaultBackend: ALPHA, probeTimeoutMs: 3_000 },
      connections: {},
      settings: [],
    };
  }

  function show(props: RoutingPanelProps) {
    return render(
      <ReactorMonitorProvider descriptors={three} registry={registry}>
        <RoutingPanel {...props} />
      </ReactorMonitorProvider>,
    );
  }

  const row = (view: ReturnType<typeof show>) =>
    view.getByTestId(`router-route-${driveA}`);

  it("routes a seed's config placement, then moves it at runtime and keeps the move", async () => {
    const storage = memoryStorage();
    const saved: [string, string][] = [];
    const props: RoutingPanelProps = {
      setName: "lab",
      storage,
      seed: seedOf("s1", { [driveA]: ALPHA }),
      onSaveToHost: (_seed, drive, backend) => {
        saved.push([drive, backend]);
        return { ok: true };
      },
    };
    const view = show(props);
    await waitFor(() => expect(row(view)).toBeTruthy(), WAIT);
    expect(view.getByTestId("router-seed").textContent).toBe(
      "Routing app's reactors.",
    );
    expect(within(row(view)).getByText("alpha")).toBeTruthy();
    expect(within(row(view)).queryByTestId("router-route-drift")).toBeNull();

    fireEvent.change(within(row(view)).getByTestId("router-route-backend"), {
      target: { value: BETA },
    });
    await waitFor(() =>
      expect(
        within(row(view)).getByTestId("router-route-drift").textContent,
      ).toBe("Moved here. Host config: main"),
    );
    fireEvent.click(within(row(view)).getByText("Save to host config"));
    expect(saved).toEqual([["alpha", "sb"]]);
    expect(
      within(row(view)).getByTestId("router-route-saved").textContent,
    ).toBe("Saved to the builder's draft. Review it in Build host.");
    view.unmount();

    // Rebuilt for the same set, the move is applied again over the config.
    const again = show(props);
    await waitFor(
      () =>
        expect(
          within(row(again)).getByTestId("router-route-drift").textContent,
        ).toBe("Moved here. Host config: main"),
      WAIT,
    );
    const handle = (
      window as unknown as {
        __reactorMonitor?: { router?: RoutingReactorClient };
      }
    ).__reactorMonitor?.router;
    expect(
      handle
        ?.describeRouting()
        .collections.find((entry) => entry.collectionId === driveA),
    ).toMatchObject({ backend: BETA, origin: "runtime", configured: ALPHA });

    fireEvent.click(within(row(again)).getByText("Reset to config"));
    await waitFor(() =>
      expect(within(row(again)).queryByTestId("router-route-drift")).toBeNull(),
    );
    expect(storage.getItem(PLACEMENTS_STORAGE_KEY)).toBe("{}");
    again.unmount();
  }, 60_000);

  it("keeps a move across a new start, whose switchboard has a new name", async () => {
    const storage = memoryStorage();
    const first = show({
      setName: "lab",
      storage,
      seed: seedOf("s1", { [driveA]: ALPHA }),
    });
    await waitFor(() => expect(row(first)).toBeTruthy(), WAIT);
    fireEvent.change(within(row(first)).getByTestId("router-route-backend"), {
      target: { value: BETA },
    });
    await waitFor(() =>
      expect(within(row(first)).getByTestId("router-route-drift")).toBeTruthy(),
    );
    first.unmount();
    expect(JSON.parse(storage.getItem(PLACEMENTS_STORAGE_KEY) ?? "")).toEqual({
      lab: {
        "web/app/alpha": { backend: "sb", configWas: "main", app: "web/app" },
      },
    });

    const restarted = show({
      setName: "lab",
      storage,
      seed: seedOf("s2", { [driveA]: ALPHA }, GAMMA),
    });
    await waitFor(
      () =>
        expect(
          within(row(restarted)).getByTestId("router-route-drift").textContent,
        ).toBe("Moved here. Host config: main"),
      WAIT,
    );
    expect(
      (
        within(row(restarted)).getByTestId(
          "router-route-backend",
        ) as HTMLSelectElement
      ).value,
    ).toBe(GAMMA);
    expect(restarted.queryByTestId("router-placement-note")).toBeNull();
    restarted.unmount();
  }, 60_000);

  it("keeps an unplaced link's move when its switchboard reports a new id", async () => {
    const storage = memoryStorage();
    const unplaced = (id: string, driveId: string, switchboard: string) => ({
      ...seedOf(id, {}, switchboard),
      drives: { [driveId]: "shared" },
    });
    const first = show({
      setName: "lab",
      storage,
      seed: unplaced("s1", "old-id", BETA),
    });
    await waitFor(
      () => expect(first.getByTestId("router-table")).toBeTruthy(),
      WAIT,
    );
    fireEvent.change(first.getByTestId("router-move-key"), {
      target: { value: "old-id" },
    });
    fireEvent.change(first.getByTestId("router-move-backend"), {
      target: { value: ALPHA },
    });
    fireEvent.click(first.getByTestId("router-move"));
    await waitFor(() =>
      expect(first.getByTestId("router-route-old-id")).toBeTruthy(),
    );
    first.unmount();
    expect(JSON.parse(storage.getItem(PLACEMENTS_STORAGE_KEY) ?? "")).toEqual({
      lab: { "web/app/shared": { backend: "main", app: "web/app" } },
    });

    const restarted = show({
      setName: "lab",
      storage,
      seed: unplaced("s2", "new-id", GAMMA),
    });
    const moved = await waitFor(
      () => restarted.getByTestId("router-route-new-id"),
      WAIT,
    );
    expect(within(moved).getByTestId("router-route-drift").textContent).toBe(
      "Moved here. The host config doesn't place it.",
    );
    expect(
      (within(moved).getByTestId("router-route-backend") as HTMLSelectElement)
        .value,
    ).toBe(ALPHA);
    expect(restarted.queryByTestId("router-route-old-id")).toBeNull();
    restarted.unmount();
  }, 60_000);

  it("drops a kept move once the config value it replaced changes", async () => {
    const storage = memoryStorage();
    const first = show({
      setName: "lab",
      storage,
      seed: seedOf("s1", { [driveA]: ALPHA }),
    });
    await waitFor(() => expect(row(first)).toBeTruthy(), WAIT);
    fireEvent.change(within(row(first)).getByTestId("router-route-backend"), {
      target: { value: BETA },
    });
    await waitFor(() =>
      expect(within(row(first)).getByTestId("router-route-drift")).toBeTruthy(),
    );
    first.unmount();

    const changed = show({
      setName: "lab",
      storage,
      seed: seedOf("s2", { [driveA]: BETA }),
    });
    await waitFor(
      () =>
        expect(changed.getByTestId("router-placement-note").textContent).toBe(
          "The host config changed for 1 moved drive, so its move was dropped.",
        ),
      WAIT,
    );
    expect(within(row(changed)).queryByTestId("router-route-drift")).toBeNull();
    expect(storage.getItem(PLACEMENTS_STORAGE_KEY)).toBe("{}");
    changed.unmount();
  }, 60_000);

  it("keeps moves per monitoring set", async () => {
    const storage = memoryStorage();
    const lab = show({ setName: "lab", storage });
    await waitFor(
      () =>
        expect(lab.getByTestId(`router-backend-option-${ALPHA}`)).toBeTruthy(),
      WAIT,
    );
    fireEvent.click(lab.getByTestId(`router-backend-option-${ALPHA}`));
    fireEvent.click(lab.getByTestId(`router-backend-option-${BETA}`));
    fireEvent.click(lab.getByTestId("router-build"));
    fireEvent.change(lab.getByTestId("router-move-key"), {
      target: { value: driveA },
    });
    fireEvent.change(lab.getByTestId("router-move-backend"), {
      target: { value: BETA },
    });
    fireEvent.click(lab.getByTestId("router-move"));
    await waitFor(() =>
      expect(
        within(row(lab)).getByTestId("router-route-drift").textContent,
      ).toBe("Moved here. The host config doesn't place it."),
    );
    lab.unmount();
    expect(JSON.parse(storage.getItem(PLACEMENTS_STORAGE_KEY) ?? "")).toEqual({
      lab: { [driveA]: { backend: BETA } },
    });

    const other = show({ setName: "other", storage });
    fireEvent.click(other.getByTestId(`router-backend-option-${ALPHA}`));
    fireEvent.click(other.getByTestId(`router-backend-option-${BETA}`));
    fireEvent.click(other.getByTestId("router-build"));
    await waitFor(() => expect(other.getByTestId("router-table")).toBeTruthy());
    expect(other.queryByTestId(`router-route-${driveA}`)).toBeNull();
    other.unmount();
  }, 60_000);

  it("builds a seeded router from the Connect's settings, and a manual one with the defaults", async () => {
    builds.length = 0;
    const seed: RouteSeed = {
      ...seedOf("s-settings", {}),
      router: {
        defaultBackend: BETA,
        probeTimeoutMs: 1_000,
        provisionalRouteMs: 300_000,
      },
      connections: { [BETA]: { requestTimeoutMs: 120_000, breaker: false } },
      settings: ["New drives: on sb", "Connection to sb: wait up to 2 min"],
    };
    const seeded = show({
      setName: "settings",
      storage: memoryStorage(),
      seed,
    });
    await waitFor(
      () => expect(seeded.getByTestId("router-table")).toBeTruthy(),
      WAIT,
    );
    const [reactors, options, connections] = builds.at(-1) as [
      { name: string }[],
      Record<string, unknown>,
      unknown,
    ];
    expect(reactors.map((reactor) => reactor.name)).toEqual([ALPHA, BETA]);
    expect(options).toMatchObject({
      defaultBackend: BETA,
      probeTimeoutMs: 1_000,
      provisionalRouteMs: 300_000,
    });
    expect(connections).toEqual(seed.connections);
    // New drives go where the host config says, not by hash.
    const results = new Set<string>();
    for (const name of ["One", "Two", "Three"]) {
      fireEvent.change(seeded.getByTestId("router-create-drive-name"), {
        target: { value: name },
      });
      fireEvent.click(seeded.getByTestId("router-create-drive"));
      await waitFor(() => {
        const text =
          seeded.queryByTestId("router-create-result")?.textContent ?? "";
        expect(results.has(text)).toBe(false);
        expect(text).toMatch(new RegExp(` on ${BETA}$`));
        results.add(text);
      }, WAIT);
    }
    const block = within(seeded.getByTestId("router-host-config"));
    expect(block.getByText("From the host config")).toBeTruthy();
    expect(
      block.getAllByRole("listitem").map((item) => item.textContent),
    ).toEqual(seed.settings);
    seeded.unmount();

    const manual = show({
      setName: "settings-manual",
      storage: memoryStorage(),
    });
    fireEvent.click(manual.getByTestId(`router-backend-option-${ALPHA}`));
    fireEvent.click(manual.getByTestId(`router-backend-option-${BETA}`));
    fireEvent.click(manual.getByTestId("router-build"));
    await waitFor(() =>
      expect(manual.getByTestId("router-table")).toBeTruthy(),
    );
    const [, manualOptions, manualConnections] = builds.at(-1) as [
      unknown,
      Record<string, unknown>,
      unknown,
    ];
    expect(Object.keys(manualOptions).sort()).toEqual([
      "collections",
      "onDiagnostic",
      "requirements",
    ]);
    expect(manualConnections).toBeUndefined();
    expect(manual.queryByTestId("router-host-config")).toBeNull();
    manual.unmount();
  }, 60_000);
});
