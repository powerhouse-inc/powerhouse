import { DriveCollectionId } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  applyPlacementEntries,
  keepsLocalCopy,
  LOCAL_BACKEND_NAME,
  localDrivePlacements,
  placementKeys,
  removeLocalCopies,
  resolveSwitchboardDrives,
  servedUrl,
  servesSlug,
  switchboardDrives,
  type SwitchboardDrive,
} from "../src/runtime/drive-placement.js";

const LOCAL = LOCAL_BACKEND_NAME;

const remoteBackends = [
  { name: "sb", url: "http://localhost:4001/d/b" },
  { name: "other", url: "http://localhost:4002/api/d/home" },
];

const driveB: SwitchboardDrive = {
  slug: "b",
  url: "http://localhost:4001/d/b",
  remote: "sb",
  configured: "sb",
  collection: false,
};
const driveC: SwitchboardDrive = {
  slug: "c",
  url: "http://localhost:4001/d/c",
  remote: "sb",
  configured: LOCAL,
  collection: false,
};

describe("switchboardDrives", () => {
  it("lists remote default drives with a backend, then collections, with where the config opens them", () => {
    expect(
      switchboardDrives({
        instance: {
          remoteBackends,
          collections: {
            workflows: { backend: "other", sync: false },
            gone: { backend: "missing", sync: false },
          },
        },
        drives: {
          defaultDrives: [
            { url: "http://localhost:4001/d/b", backend: "sb", sync: false },
            { url: "http://localhost:4001/d/c", backend: "sb" },
            { url: "http://elsewhere/d/x" },
            { local: true, id: "a" },
          ],
        },
      }),
    ).toEqual([
      driveB,
      driveC,
      {
        slug: "workflows",
        url: "http://localhost:4002/api/d/workflows",
        remote: "other",
        configured: "other",
        collection: true,
      },
    ]);
  });

  it("lists nothing for a config without switchboard backends", () => {
    expect(switchboardDrives({})).toEqual([]);
    expect(
      switchboardDrives({
        drives: { defaultDrives: [{ url: "http://localhost:4001/d/b" }] },
      }),
    ).toEqual([]);
  });
});

describe("keepsLocalCopy", () => {
  it("is false only for a remote drive with sync:false", () => {
    expect(keepsLocalCopy({ url: "http://h/d/b", sync: false })).toBe(false);
    expect(keepsLocalCopy({ url: "http://h/d/b", sync: true })).toBe(true);
    expect(keepsLocalCopy({ url: "http://h/d/b" })).toBe(true);
    expect(keepsLocalCopy({ local: true, id: "a" })).toBe(true);
  });
});

describe("localDrivePlacements", () => {
  it("places each local default drive with an id on this browser", () => {
    expect(
      localDrivePlacements([
        { local: true, id: "a" },
        { url: "http://h/d/b" },
        { local: true, id: "" },
      ]),
    ).toEqual({ a: LOCAL_BACKEND_NAME });
  });
});

describe("applyPlacementEntries", () => {
  it("applies a move whose config value still holds", () => {
    const keep = { slug: "b", backend: LOCAL, configWas: "sb" };
    const move = { slug: "c", backend: "sb", configWas: LOCAL };
    expect(applyPlacementEntries([driveB, driveC], [keep, move])).toEqual({
      applied: [keep, move],
      stale: [],
    });
  });

  it("drops a move once the config value it replaced changes", () => {
    const keep = { slug: "b", backend: LOCAL, configWas: LOCAL };
    expect(applyPlacementEntries([driveB], [keep])).toEqual({
      applied: [],
      stale: [keep],
    });
  });

  it("drops a move for a drive the config no longer lists, back to the config, or to another backend", () => {
    const gone = { slug: "z", backend: LOCAL, configWas: "sb" };
    const same = { slug: "b", backend: "sb", configWas: "sb" };
    const elsewhere = { slug: "c", backend: "other", configWas: LOCAL };
    expect(
      applyPlacementEntries([driveB, driveC], [gone, same, elsewhere]),
    ).toEqual({ applied: [], stale: [gone, same, elsewhere] });
  });
});

describe("servesSlug", () => {
  it("matches the declared slug as is or hashed", () => {
    expect(servesSlug("vetra", "vetra")).toBe(true);
    expect(servesSlug("vetra", "vetra-0123abcd")).toBe(true);
    expect(servesSlug("vetra", "vetra-preview")).toBe(false);
    expect(servesSlug("vetra", "vetra-0123abcde")).toBe(false);
  });
});

describe("resolveSwitchboardDrives", () => {
  it("names each drive by id and served slug, by its address alone when unreachable", async () => {
    const fetchInfo = vi.fn((url: string) =>
      url.endsWith("/b")
        ? Promise.resolve({ id: "id-b", slug: "b" })
        : Promise.reject(new Error("down")),
    );
    const resolved = await resolveSwitchboardDrives(
      [driveB, driveC],
      fetchInfo,
    );
    expect(resolved).toEqual([
      { ...driveB, id: "id-b", servedSlug: "b" },
      { ...driveC, servedSlug: "c" },
    ]);
  });

  it("finds a collection served under a hashed slug among its switchboard's drives", async () => {
    const vetra: SwitchboardDrive = {
      slug: "vetra",
      url: "http://localhost:4001/d/vetra",
      remote: "sb",
      configured: "sb",
      collection: true,
    };
    const findServed = vi.fn(() =>
      Promise.resolve({ id: "id-v", slug: "vetra-0123abcd" }),
    );
    const resolved = await resolveSwitchboardDrives(
      [vetra, driveC],
      () => Promise.reject(new Error("404")),
      { findServed },
    );
    expect(resolved).toEqual([
      { ...vetra, id: "id-v", servedSlug: "vetra-0123abcd" },
      { ...driveC, servedSlug: "c" },
    ]);
    expect(findServed).toHaveBeenCalledTimes(1);
    expect(servedUrl(resolved[0])).toBe(
      "http://localhost:4001/d/vetra-0123abcd",
    );
    expect(placementKeys(resolved[0])).toEqual(["id-v", "vetra-0123abcd"]);
  });

  it("stops waiting for a drive that does not answer", async () => {
    const resolved = await resolveSwitchboardDrives(
      [driveB],
      () => new Promise(() => undefined),
      { timeoutMs: 20 },
    );
    expect(resolved).toEqual([{ ...driveB, servedSlug: "b" }]);
  });
});

describe("removeLocalCopies", () => {
  it("removes the sync remotes of the given drives, and no others", async () => {
    const remote = (name: string, driveId: string) => ({
      meta: { name, collectionId: DriveCollectionId.forDrive(driveId) },
    });
    const remotes = [
      remote("r1", "id-b"),
      remote("r2", "id-c"),
      remote("r3", "id-b"),
    ];
    const sync = {
      list: () => remotes,
      remove: vi.fn(() => Promise.resolve()),
    };
    await removeLocalCopies(sync, [{ id: "id-b" }, {}]);
    expect(sync.remove.mock.calls).toEqual([["r1"], ["r3"]]);
  });
});
