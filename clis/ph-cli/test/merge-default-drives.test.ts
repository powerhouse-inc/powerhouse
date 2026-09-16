import type { PHConnectDefaultDrive } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "vitest";
import { mergeDefaultDrives } from "../src/utils/merge-default-drives.js";

const remote = (
  url: string,
  name: string | null = null,
): PHConnectDefaultDrive => ({ url, name, icon: null });

const local = (
  id: string,
  name: string | null = null,
): PHConnectDefaultDrive => ({ local: true, id, name, icon: null });

describe("mergeDefaultDrives", () => {
  it("concatenates groups in order when nothing duplicates", () => {
    expect(
      mergeDefaultDrives(
        [remote("http://localhost:4001/d/vetra")],
        [
          remote("http://localhost:4001/d/dashboard"),
          remote("http://localhost:4001/d/workflows"),
        ],
      ),
    ).toEqual([
      { url: "http://localhost:4001/d/vetra", name: null, icon: null },
      { url: "http://localhost:4001/d/dashboard", name: null, icon: null },
      { url: "http://localhost:4001/d/workflows", name: null, icon: null },
    ]);
  });

  it("dedupes remote entries by URL, keeping the first occurrence", () => {
    expect(
      mergeDefaultDrives(
        [remote("http://localhost:4001/d/vetra", "Vetra")],
        [
          remote("http://localhost:4001/d/vetra", "Vetra (configured)"),
          remote("http://localhost:4001/d/x"),
        ],
      ),
    ).toEqual([
      { url: "http://localhost:4001/d/vetra", name: "Vetra", icon: null },
      { url: "http://localhost:4001/d/x", name: null, icon: null },
    ]);
  });

  it("dedupes local entries by id, keeping the first occurrence", () => {
    expect(
      mergeDefaultDrives(
        [local("drive-a", "A")],
        [local("drive-a", "A (configured)"), local("drive-b")],
      ),
    ).toEqual([
      { local: true, id: "drive-a", name: "A", icon: null },
      { local: true, id: "drive-b", name: null, icon: null },
    ]);
  });

  it("does not collide a local id with a remote URL of the same string", () => {
    expect(
      mergeDefaultDrives([local("same-string")], [remote("same-string")]),
    ).toEqual([
      { local: true, id: "same-string", name: null, icon: null },
      { url: "same-string", name: null, icon: null },
    ]);
  });

  it("skips empty groups", () => {
    expect(
      mergeDefaultDrives([], [remote("http://a"), remote("http://a")], []),
    ).toEqual([{ url: "http://a", name: null, icon: null }]);
  });

  it("does not mutate its input groups", () => {
    const a = [remote("http://a"), remote("http://a")];
    const b = [remote("http://a"), remote("http://b")];
    mergeDefaultDrives(a, b);
    expect(a).toHaveLength(2);
    expect(b).toHaveLength(2);
  });
});
