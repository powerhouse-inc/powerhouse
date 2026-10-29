import { DriveCollectionId } from "@powerhousedao/reactor";
import { describe, expect, it, vi } from "vitest";
import {
  keepsLocalCopy,
  placedDrives,
  placementCollections,
  removeLocalCopies,
  resolvePlacedDrives,
} from "../src/runtime/drive-placement.js";

const remoteBackends = [
  { name: "sb", url: "http://localhost:4001/d/b" },
  { name: "other", url: "http://localhost:4002/api/d/home" },
];

describe("placedDrives", () => {
  it("lists the drives that keep no copy in this browser", () => {
    expect(
      placedDrives({
        instance: {
          remoteBackends,
          collections: {
            workflows: { backend: "other", sync: false },
            synced: { backend: "sb" },
            gone: { backend: "missing", sync: false },
          },
        },
        drives: {
          defaultDrives: [
            { url: "http://localhost:4001/d/b", backend: "sb", sync: false },
            { url: "http://localhost:4001/d/c", backend: "sb" },
            { local: true, id: "a" },
          ],
        },
      }),
    ).toEqual([
      { backend: "sb", url: "http://localhost:4001/d/b" },
      { backend: "other", url: "http://localhost:4002/api/d/workflows" },
    ]);
  });

  it("lists nothing for a config without placement", () => {
    expect(placedDrives({})).toEqual([]);
    expect(
      placedDrives({
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

describe("resolvePlacedDrives", () => {
  it("names each drive by id and served slug, by its address alone when unreachable", async () => {
    const fetchInfo = vi.fn((url: string) =>
      url.endsWith("/b")
        ? Promise.resolve({ id: "id-b", slug: "b-0123abcd" })
        : Promise.reject(new Error("down")),
    );
    const resolved = await resolvePlacedDrives(
      [
        { backend: "sb", url: "http://localhost:4001/d/b" },
        { backend: "other", url: "http://localhost:4002/api/d/workflows" },
      ],
      fetchInfo,
    );
    expect(resolved).toEqual([
      {
        backend: "sb",
        url: "http://localhost:4001/d/b",
        id: "id-b",
        slug: "b-0123abcd",
      },
      {
        backend: "other",
        url: "http://localhost:4002/api/d/workflows",
        slug: "workflows",
      },
    ]);
    expect(placementCollections(resolved)).toEqual({
      "id-b": "sb",
      "b-0123abcd": "sb",
      workflows: "other",
    });
  });

  it("stops waiting for a drive that does not answer", async () => {
    const resolved = await resolvePlacedDrives(
      [{ backend: "sb", url: "http://localhost:4001/d/b" }],
      () => new Promise(() => undefined),
      20,
    );
    expect(resolved).toEqual([
      { backend: "sb", url: "http://localhost:4001/d/b", slug: "b" },
    ]);
  });
});

describe("removeLocalCopies", () => {
  it("removes the sync remotes of placed drives, and no others", async () => {
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
    await removeLocalCopies(sync, [
      { backend: "sb", url: "http://h/d/b", id: "id-b", slug: "b" },
      { backend: "sb", url: "http://h/d/x", slug: "x" },
    ]);
    expect(sync.remove.mock.calls).toEqual([["r1"], ["r3"]]);
  });
});
