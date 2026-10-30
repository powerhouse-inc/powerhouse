import { describe, expect, it } from "vitest";
import type { ReactorDescriptor } from "@powerhousedao/reactor-monitor";
import {
  DEFAULT_SET_NAME,
  MONITORING_SETS_STORAGE_KEY,
  MonitoringSetsStore,
  type WebStorageLike,
} from "./monitoring-sets.js";
import { buildDescriptor } from "./provisioning.js";

/** A Map-backed storage plus the raw cells, so a test can read what persisted. */
function fakeStorage(): {
  storage: WebStorageLike;
  cells: Map<string, string>;
} {
  const cells = new Map<string, string>();
  return {
    cells,
    storage: {
      getItem: (key) => cells.get(key) ?? null,
      setItem: (key, value) => {
        cells.set(key, value);
      },
    },
  };
}

/** A storage whose every access throws, as a blocked/private-mode browser does. */
const throwingStorage: WebStorageLike = {
  getItem: () => {
    throw new Error("storage blocked");
  },
  setItem: () => {
    throw new Error("storage blocked");
  },
};

const remoteDescriptor: ReactorDescriptor = {
  kind: "remote",
  name: "switchboard",
  remote: { url: "http://localhost:4001/d/powerhouse" },
};

describe("MonitoringSetsStore", () => {
  it("never persists a remote's bearer token", () => {
    const token = "bearer-secret-7f3a";
    const { storage, cells } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    const fromForm = buildDescriptor({
      kind: "remote",
      name: "authed",
      syncMode: "local",
      remoteUrl: "http://localhost:4001/d/powerhouse",
      bearer: token,
    });
    const staticHeaders = {
      kind: "remote",
      name: "static",
      remote: {
        url: "http://localhost:4002/d/powerhouse",
        headers: { Authorization: `Bearer ${token}` },
      },
    } as unknown as ReactorDescriptor;

    store.setActiveDescriptors([fromForm, staticHeaders]);

    for (const value of cells.values()) {
      expect(value).not.toContain(token);
    }
    const reloaded = new MonitoringSetsStore(storage).getActiveDescriptors();
    expect(reloaded.map((d) => d.remote)).toEqual([
      { url: "http://localhost:4001/d/powerhouse" },
      { url: "http://localhost:4002/d/powerhouse" },
    ]);
  });

  it("seeds a single empty default set when storage is empty", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);

    expect(store.listSetNames()).toEqual([DEFAULT_SET_NAME]);
    expect(store.getActiveSetName()).toBe(DEFAULT_SET_NAME);
    expect(store.getActiveDescriptors()).toEqual([]);
  });

  it("writes provisioned descriptors through to the active set and persists them", () => {
    const { storage, cells } = fakeStorage();
    const store = new MonitoringSetsStore(storage);

    store.setActiveDescriptors([remoteDescriptor]);

    expect(store.getActiveDescriptors()).toEqual([remoteDescriptor]);
    const persisted = JSON.parse(
      cells.get(MONITORING_SETS_STORAGE_KEY) ?? "null",
    ) as { sets: { name: string; descriptors: ReactorDescriptor[] }[] };
    expect(persisted.sets[0].descriptors).toEqual([remoteDescriptor]);
  });

  it("survives a reload: a second store over the same storage reads the sets back", () => {
    const { storage } = fakeStorage();
    const first = new MonitoringSetsStore(storage);
    first.createSet("staging");
    first.setActiveDescriptors([remoteDescriptor]);

    const second = new MonitoringSetsStore(storage);
    expect(second.getActiveSetName()).toBe("staging");
    expect(second.listSetNames()).toEqual([DEFAULT_SET_NAME, "staging"]);
    expect(second.getActiveDescriptors()).toEqual([remoteDescriptor]);
  });

  it("creates a set, makes it active, and leaves the old set's descriptors intact", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    store.setActiveDescriptors([remoteDescriptor]);

    const created = store.createSet("staging");

    expect(created).toEqual([]);
    expect(store.getActiveSetName()).toBe("staging");
    expect(store.switchActiveSet(DEFAULT_SET_NAME)).toEqual([remoteDescriptor]);
  });

  it("switches the active set and returns that set's descriptors", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    store.createSet("staging");
    store.setActiveDescriptors([remoteDescriptor]);

    expect(store.switchActiveSet(DEFAULT_SET_NAME)).toEqual([]);
    expect(store.getActiveSetName()).toBe(DEFAULT_SET_NAME);
    expect(store.switchActiveSet("staging")).toEqual([remoteDescriptor]);
  });

  it("ignores a switch to a set that does not exist", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);

    expect(store.switchActiveSet("missing")).toEqual([]);
    expect(store.getActiveSetName()).toBe(DEFAULT_SET_NAME);
  });

  it("renames a set and carries the active pointer with it", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    store.setActiveDescriptors([remoteDescriptor]);

    store.renameSet(DEFAULT_SET_NAME, "prod");

    expect(store.listSetNames()).toEqual(["prod"]);
    expect(store.getActiveSetName()).toBe("prod");
    expect(store.getActiveDescriptors()).toEqual([remoteDescriptor]);
  });

  it("does not clobber an existing set when a rename target collides", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    store.createSet("staging");

    store.renameSet("staging", DEFAULT_SET_NAME);

    expect(store.listSetNames()).toEqual([DEFAULT_SET_NAME, "staging"]);
  });

  it("deletes a set and moves active to a remaining one", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    store.createSet("staging");
    store.setActiveDescriptors([remoteDescriptor]);

    const activeAfter = store.deleteSet("staging");

    expect(store.listSetNames()).toEqual([DEFAULT_SET_NAME]);
    expect(store.getActiveSetName()).toBe(DEFAULT_SET_NAME);
    expect(activeAfter).toEqual([]);
  });

  it("re-seeds an empty default rather than leaving no sets when the last is deleted", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);
    store.setActiveDescriptors([remoteDescriptor]);

    store.deleteSet(DEFAULT_SET_NAME);

    expect(store.listSetNames()).toEqual([DEFAULT_SET_NAME]);
    expect(store.getActiveDescriptors()).toEqual([]);
  });

  it("degrades to an in-memory default when storage throws, without crashing at boot", () => {
    const store = new MonitoringSetsStore(throwingStorage);

    expect(store.listSetNames()).toEqual([DEFAULT_SET_NAME]);
    expect(store.getActiveSetName()).toBe(DEFAULT_SET_NAME);
    // A mutation whose persist throws still applies in memory.
    expect(() => store.setActiveDescriptors([remoteDescriptor])).not.toThrow();
    expect(store.getActiveDescriptors()).toEqual([remoteDescriptor]);
  });

  it("degrades to the default when the stored value is malformed JSON", () => {
    const { storage, cells } = fakeStorage();
    cells.set(MONITORING_SETS_STORAGE_KEY, "{ not json");

    const store = new MonitoringSetsStore(storage);

    expect(store.listSetNames()).toEqual([DEFAULT_SET_NAME]);
    expect(store.getActiveDescriptors()).toEqual([]);
  });

  it("drops a persisted active-set name that no longer exists", () => {
    const { storage, cells } = fakeStorage();
    cells.set(
      MONITORING_SETS_STORAGE_KEY,
      JSON.stringify({
        sets: [{ name: "only", descriptors: [] }],
        activeSetName: "gone",
      }),
    );

    const store = new MonitoringSetsStore(storage);

    expect(store.getActiveSetName()).toBe("only");
  });

  it("imports a set without activating it and uniquifies its name", () => {
    const { storage } = fakeStorage();
    const store = new MonitoringSetsStore(storage);

    expect(store.importSet("cli", [remoteDescriptor])).toBe("cli");
    expect(store.importSet("cli", [])).toBe("cli-2");
    expect(store.importSet("cli", [])).toBe("cli-3");

    expect(store.getActiveSetName()).toBe(DEFAULT_SET_NAME);
    expect(store.listSetNames()).toEqual([
      DEFAULT_SET_NAME,
      "cli",
      "cli-2",
      "cli-3",
    ]);
    expect(store.switchActiveSet("cli")).toEqual([remoteDescriptor]);
  });

  it("round-trips an imported set's source and unknown descriptor fields", () => {
    const { storage } = fakeStorage();
    const source = { project: { name: "p", root: "/project" }, host: "cli" };
    const managed = { ...remoteDescriptor, managedBy: { id: "sb-1" } };
    new MonitoringSetsStore(storage).importSet("cli", [managed], source);

    const reloaded = new MonitoringSetsStore(storage);

    expect(reloaded.getSetSource("cli")).toEqual(source);
    expect(reloaded.getSetSource(DEFAULT_SET_NAME)).toBeUndefined();
    expect(reloaded.switchActiveSet("cli")).toEqual([managed]);
  });

  it("keeps a set whose stored source is malformed, without the source", () => {
    const { storage, cells } = fakeStorage();
    cells.set(
      MONITORING_SETS_STORAGE_KEY,
      JSON.stringify({
        sets: [
          {
            name: "cli",
            descriptors: [remoteDescriptor],
            source: { project: "p", host: 3 },
          },
        ],
        activeSetName: "cli",
      }),
    );

    const store = new MonitoringSetsStore(storage);

    expect(store.getActiveDescriptors()).toEqual([remoteDescriptor]);
    expect(store.getSetSource("cli")).toBeUndefined();
  });
});
