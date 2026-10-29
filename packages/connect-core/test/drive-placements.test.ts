import { DriveCollectionId } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  LOCAL_BACKEND_NAME,
  type PlacementEntry,
  type ResolvedSwitchboardDrive,
  type SwitchboardDrive,
} from "../src/runtime/drive-placement.js";
import {
  caughtUp,
  DrivePlacements,
  effectiveBackend,
  findServedDrive,
  needsCopy,
  type PlacementStore,
} from "../src/runtime/drive-placements.js";

const LOCAL = LOCAL_BACKEND_NAME;

const placedB: SwitchboardDrive = {
  slug: "b",
  url: "http://localhost:4001/d/b",
  remote: "sb",
  configured: "sb",
  collection: false,
};
const syncedC: SwitchboardDrive = {
  slug: "c",
  url: "http://localhost:4001/d/c",
  remote: "sb",
  configured: LOCAL,
  collection: false,
};
const resolved: ResolvedSwitchboardDrive[] = [
  { ...placedB, id: "id-b", servedSlug: "b" },
  { ...syncedC, id: "id-c", servedSlug: "c" },
];

/** One IndexedDB shared by the tabs of a browser. */
function memoryStore(initial: PlacementEntry[] = []): PlacementStore & {
  entries: Map<string, PlacementEntry>;
} {
  const entries = new Map(initial.map((entry) => [entry.slug, entry]));
  return {
    entries,
    list: () => Promise.resolve([...entries.values()]),
    put: (entry) => {
      entries.set(entry.slug, entry);
      return Promise.resolve();
    },
    delete: (slug) => {
      entries.delete(slug);
      return Promise.resolve();
    },
  };
}

function fakeSync(heldIds: string[] = []) {
  const remotes = heldIds.map((id) => ({
    meta: { name: `r-${id}`, collectionId: DriveCollectionId.forDrive(id) },
  }));
  return {
    remotes,
    list: () => remotes,
    remove: vi.fn((name: string) => {
      remotes.splice(
        remotes.findIndex((remote) => remote.meta.name === name),
        1,
      );
      return Promise.resolve();
    }),
    add: vi.fn((_url: string, id: string) => {
      remotes.push({
        meta: { name: `r-${id}`, collectionId: DriveCollectionId.forDrive(id) },
      });
      return Promise.resolve();
    }),
    untilCopied: vi.fn((_id: string, _remote: string) => Promise.resolve()),
  };
}

/** A copy that arrives, or times out, when the test says. */
function pendingCopy() {
  let arrive: () => void = () => {};
  let fail: (error: Error) => void = () => {};
  const copied = new Promise<void>((resolve, reject) => {
    arrive = resolve;
    fail = reject;
  });
  return { copied, arrive: () => arrive(), fail: (e: Error) => fail(e) };
}

function fakeRouter() {
  const runtime = new Map<string, string>();
  const configured = new Map<string, string>();
  const set =
    (layer: Map<string, string>) => (key: string, backend?: string) => {
      if (backend === undefined) layer.delete(key);
      else layer.set(key, backend);
    };
  return {
    runtime,
    configured,
    setPlacement: vi.fn(set(runtime)),
    setConfiguredPlacement: vi.fn(set(configured)),
  };
}

async function tab(
  store: PlacementStore,
  sync: ReturnType<typeof fakeSync> = fakeSync(["id-c"]),
) {
  const placements = await DrivePlacements.load(
    [placedB, syncedC],
    store,
    sync,
  );
  const router = fakeRouter();
  placements.attach(router, resolved);
  return { placements, router, sync };
}

describe("DrivePlacements", () => {
  it("installs the config's placement in the config layer under the id and served slug", async () => {
    const { placements, router } = await tab(memoryStore());

    expect(Object.fromEntries(router.configured)).toEqual({
      "id-b": "sb",
      b: "sb",
    });
    expect(router.runtime.size).toBe(0);
    expect(placements.placementOf("id-b")).toMatchObject({
      backend: "sb",
      moved: false,
    });
    expect(placements.placementOf("id-c")).toMatchObject({
      backend: LOCAL,
      moved: false,
    });
    expect(placements.placementOf("elsewhere")).toBeUndefined();
  });

  it("keeps a copy of a placed drive: stores the move, adds the sync remote, then places it here", async () => {
    const store = memoryStore();
    const { placements, router, sync } = await tab(store);
    const order: string[] = [];
    sync.add.mockImplementationOnce((_url, id) => {
      order.push(`add, stored ${store.entries.has("b")}`);
      sync.remotes.push({
        meta: { name: `r-${id}`, collectionId: DriveCollectionId.forDrive(id) },
      });
      return Promise.resolve();
    });

    await placements.move("id-b", LOCAL);

    expect(order).toEqual(["add, stored true"]);
    expect(sync.untilCopied).toHaveBeenCalledWith("id-b", "sb");
    expect(sync.add).toHaveBeenCalledWith("http://localhost:4001/d/b", "id-b");
    expect([...store.entries.values()]).toEqual([
      { slug: "b", backend: LOCAL, configWas: "sb" },
    ]);
    expect(Object.fromEntries(router.runtime)).toEqual({
      "id-b": LOCAL,
      b: LOCAL,
    });
    expect(placements.placementOf("id-b")).toMatchObject({
      backend: LOCAL,
      moved: true,
      busy: false,
    });
  });

  it("opens a synced drive on its switchboard only: removes its sync remote and keeps the local document", async () => {
    const store = memoryStore();
    const { placements, router, sync } = await tab(store);

    await placements.move("id-c", "sb");

    expect(sync.remove).toHaveBeenCalledWith("r-id-c");
    expect(sync.remotes).toEqual([]);
    expect(router.runtime.get("id-c")).toBe("sb");
    expect(store.entries.get("c")).toEqual({
      slug: "c",
      backend: "sb",
      configWas: LOCAL,
    });
    expect(placements.placementOf("id-c")).toMatchObject({ moved: true });
  });

  it("resets to the config: drops the move, restores the sync state and the config's routing", async () => {
    const store = memoryStore();
    const { placements, router, sync } = await tab(store);
    await placements.move("id-b", LOCAL);

    await placements.reset("id-b");

    expect(store.entries.size).toBe(0);
    expect(sync.remove).toHaveBeenCalledWith("r-id-b");
    expect(router.runtime.size).toBe(0);
    expect(router.configured.get("id-b")).toBe("sb");
    expect(placements.placementOf("id-b")).toMatchObject({
      backend: "sb",
      moved: false,
    });
  });

  it("restores the stored move when the sync change fails", async () => {
    const store = memoryStore();
    const { placements, router, sync } = await tab(store);
    sync.add.mockRejectedValueOnce(new Error("switchboard down"));

    await expect(placements.move("id-b", LOCAL)).rejects.toThrow(
      "switchboard down",
    );

    expect(store.entries.size).toBe(0);
    expect(router.runtime.size).toBe(0);
    expect(placements.placementOf("id-b")).toMatchObject({
      backend: "sb",
      busy: false,
    });
  });

  it("applies a move at boot and drops one whose config value changed", async () => {
    const store = memoryStore([
      { slug: "b", backend: LOCAL, configWas: "sb" },
      { slug: "c", backend: "sb", configWas: "sb" },
    ]);

    const { placements, router } = await tab(store);

    expect(placements.backendOf(placedB)).toBe(LOCAL);
    expect(placements.keepsCopy(placedB.url)).toBe(true);
    expect(placements.placed()).toEqual([]);
    expect(router.runtime.get("id-b")).toBe(LOCAL);
    await vi.waitFor(() => expect([...store.entries.keys()]).toEqual(["b"]));
  });

  it("brings another tab in line when it re-reads the store", async () => {
    const store = memoryStore();
    const a = await tab(store);
    const b = await tab(store);
    const seen = vi.fn();
    b.placements.subscribe(seen);

    await a.placements.move("id-c", "sb");

    expect(await b.placements.reload()).toBe(true);
    expect(b.router.runtime.get("id-c")).toBe("sb");
    expect(b.placements.placementOf("id-c")).toMatchObject({ moved: true });
    expect(seen).toHaveBeenCalled();
    expect(await b.placements.reload()).toBe(false);
  });

  it("routes another tab to a kept copy only once the copy has arrived", async () => {
    const store = memoryStore();
    const sync = fakeSync(["id-c"]);
    const a = await tab(store, sync);
    const b = await tab(store, sync);
    const copy = pendingCopy();
    sync.untilCopied.mockReturnValue(copy.copied);

    b.router.setPlacement.mockClear();
    const moving = a.placements.move("id-b", LOCAL);
    await vi.waitFor(() => expect(sync.add).toHaveBeenCalled());
    // The worker's broadcast after the add reaches B while A still waits.
    const following = b.placements.reload();
    const again = b.placements.reload();
    await vi.waitFor(() =>
      expect(b.placements.placementOf("id-b")).toMatchObject({
        busy: true,
        movingTo: LOCAL,
        backend: "sb",
      }),
    );
    expect(b.router.runtime.size).toBe(0);
    expect(a.router.runtime.size).toBe(0);
    expect(await again).toBe(false);

    copy.arrive();
    await moving;
    expect(await following).toBe(true);

    for (const t of [a, b]) {
      expect(t.router.runtime.get("id-b")).toBe(LOCAL);
      expect(t.placements.placementOf("id-b")).toMatchObject({
        backend: LOCAL,
        moved: true,
        busy: false,
      });
    }
    // Once per key: the second broadcast did not install again.
    expect(b.router.setPlacement).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["Reset to config", (p: DrivePlacements) => p.reset("id-c")],
    ["Keep a copy", (p: DrivePlacements) => p.move("id-c", LOCAL)],
  ])(
    "routes another tab back to a config-kept copy only once it has arrived (%s)",
    async (_name, keepCopy) => {
      const store = memoryStore([
        { slug: "c", backend: "sb", configWas: LOCAL },
      ]);
      const sync = fakeSync();
      const a = await tab(store, sync);
      const b = await tab(store, sync);
      expect(b.router.runtime.get("id-c")).toBe("sb");
      const copy = pendingCopy();
      sync.untilCopied.mockReturnValue(copy.copied);

      const moving = keepCopy(a.placements);
      await vi.waitFor(() => expect(sync.add).toHaveBeenCalled());
      expect(store.entries.size).toBe(0);
      const following = b.placements.reload();
      await vi.waitFor(() =>
        expect(b.placements.placementOf("id-c")).toMatchObject({
          busy: true,
          movingTo: LOCAL,
          backend: "sb",
        }),
      );
      expect(b.router.runtime.get("id-c")).toBe("sb");
      expect(sync.untilCopied).toHaveBeenCalledWith("id-c", "sb");

      copy.arrive();
      await moving;
      expect(await following).toBe(true);
      for (const t of [a, b]) {
        expect(t.router.runtime.has("id-c")).toBe(false);
        expect(t.placements.placementOf("id-c")).toMatchObject({
          backend: LOCAL,
          moved: false,
          busy: false,
        });
      }
    },
  );

  it("leaves both tabs on the switchboard, with no sync remote, when the copy never arrives", async () => {
    const store = memoryStore();
    const sync = fakeSync(["id-c"]);
    const a = await tab(store, sync);
    const b = await tab(store, sync);
    const copy = pendingCopy();
    sync.untilCopied.mockReturnValue(copy.copied);

    const moving = a.placements.move("id-b", LOCAL);
    await vi.waitFor(() => expect(sync.add).toHaveBeenCalled());
    const following = b.placements.reload();
    await vi.waitFor(() =>
      expect(b.placements.placementOf("id-b")).toMatchObject({ busy: true }),
    );

    copy.fail(new Error("Timed out after 30000ms waiting for document id-b"));
    await expect(moving).rejects.toThrow(/Timed out/);
    await following;
    // The rollback's removal broadcast.
    expect(await b.placements.reload()).toBe(false);

    expect(store.entries.size).toBe(0);
    expect(sync.remotes.map((r) => r.meta.name)).toEqual(["r-id-c"]);
    for (const t of [a, b]) {
      expect(t.router.runtime.size).toBe(0);
      expect(t.placements.placementOf("id-b")).toMatchObject({
        backend: "sb",
        moved: false,
        busy: false,
      });
    }
  });

  it("honours a move another tab made while this one was booting", async () => {
    const store = memoryStore();
    const sync = fakeSync(["id-c"]);
    const booting = await DrivePlacements.load([placedB, syncedC], store, sync);
    const a = await tab(store, sync);

    await a.placements.move("id-b", LOCAL);
    await a.placements.move("id-c", "sb");

    const router = fakeRouter();
    expect(await booting.start(router, resolved, true)).toEqual([]);

    expect(sync.remotes.map((r) => r.meta.name)).toEqual(["r-id-b"]);
    expect(sync.remove).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(router.runtime)).toEqual({
      "id-b": LOCAL,
      b: LOCAL,
      "id-c": "sb",
      c: "sb",
    });
  });

  it("drops the sync remotes of placed drives when it starts, and keeps those of moved ones", async () => {
    const store = memoryStore([{ slug: "b", backend: LOCAL, configWas: "sb" }]);
    const sync = fakeSync(["id-b", "id-c"]);
    const placements = await DrivePlacements.load(
      [placedB, syncedC],
      store,
      sync,
    );

    await placements.start(fakeRouter(), resolved, true);

    expect(sync.remove).not.toHaveBeenCalled();
    await placements.move("id-c", "sb");
    const fresh = await DrivePlacements.load([placedB, syncedC], store, sync);
    sync.remotes.push({
      meta: {
        name: "r-id-c",
        collectionId: DriveCollectionId.forDrive("id-c"),
      },
    });
    await fresh.start(fakeRouter(), resolved, true);
    expect(sync.remotes.map((r) => r.meta.name)).toEqual(["r-id-b"]);
  });

  it("refuses a drive it does not place and a backend the drive can't open on", async () => {
    const { placements } = await tab(memoryStore());

    await expect(placements.move("elsewhere", LOCAL)).rejects.toThrow(
      /not on a switchboard/,
    );
    await expect(placements.move("id-b", "other")).rejects.toThrow(
      /can't open on other/,
    );
  });
});

describe("effectiveBackend and needsCopy", () => {
  it("opens a drive where its move says, else where the config does, and needs a copy only here", () => {
    const move = { slug: "c", backend: "sb", configWas: LOCAL };
    expect(effectiveBackend(syncedC, move)).toBe("sb");
    expect(effectiveBackend(syncedC, undefined)).toBe(LOCAL);
    expect(effectiveBackend(placedB, undefined)).toBe("sb");
    expect(needsCopy(LOCAL)).toBe(true);
    expect(needsCopy("sb")).toBe(false);
  });
});

describe("caughtUp", () => {
  it("holds once every scope of the source is reached", () => {
    expect(
      caughtUp({ global: 5, document: 1 }, { global: 5, document: 1 }),
    ).toBe(true);
    expect(caughtUp({ global: 6, document: 1 }, { global: 5 })).toBe(true);
    expect(
      caughtUp({ global: 4, document: 1 }, { global: 5, document: 1 }),
    ).toBe(false);
    expect(caughtUp({ document: 1 }, { global: 0 })).toBe(false);
  });
});

describe("findServedDrive", () => {
  it("finds a drive served under its hashed slug on the drive's switchboard", async () => {
    const find = vi.fn(() =>
      Promise.resolve({
        results: [
          { header: { id: "id-p", slug: "vetra-preview" } },
          { header: { id: "id-v", slug: "vetra-0123abcd" } },
        ],
      }),
    );
    const router = {
      backends: [{ name: "sb", api: { find } }],
    } as unknown as Parameters<typeof findServedDrive>[0];

    expect(
      await findServedDrive(router, { ...placedB, slug: "vetra" }),
    ).toEqual({ id: "id-v", slug: "vetra-0123abcd" });
    expect(
      await findServedDrive(router, { ...placedB, remote: "missing" }),
    ).toBeUndefined();
    expect(find).toHaveBeenCalledWith({ type: "powerhouse/document-drive" });
  });
});
