import type { PHConnectDefaultDrive } from "@powerhousedao/shared/clis";
import { describe, expect, it } from "vitest";
import {
  mergeDefaultDrives,
  placeConnectDrives,
  projectDrivesIntoConnect,
  rebaseDriveUrl,
} from "../src/connect-projection.js";

const remote = (
  url: string,
  name: string | null = null,
): PHConnectDefaultDrive => ({ url, name, icon: null });

const local = (
  id: string,
  name: string | null = null,
): PHConnectDefaultDrive => ({ local: true, id, name, icon: null });

// Ported from ph-cli's merge-default-drives.test.ts with the function's move
// (uniform-runners P1.4) — behavior must stay identical.
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
    const sameString = "http://localhost:4001/d/vetra";
    expect(
      mergeDefaultDrives([remote(sameString)], [local(sameString)]),
    ).toHaveLength(2);
  });
});

describe("rebaseDriveUrl", () => {
  it.each(["localhost", "127.0.0.1", "[::1]"])(
    "rebases loopback host %s onto the public base, keeping the path",
    (host) => {
      expect(
        rebaseDriveUrl(
          `http://${host}:7064/d/vetra-abc`,
          "https://lab.example",
        ),
      ).toBe("https://lab.example/d/vetra-abc");
    },
  );

  it("strips trailing slashes from the public base", () => {
    expect(
      rebaseDriveUrl("http://localhost:7064/d/x", "https://lab.example///"),
    ).toBe("https://lab.example/d/x");
  });

  it("passes non-loopback URLs through unchanged", () => {
    expect(
      rebaseDriveUrl("https://sb.prod.example/d/x", "https://lab.example"),
    ).toBe("https://sb.prod.example/d/x");
  });

  it("passes unparseable URLs through unchanged", () => {
    expect(rebaseDriveUrl("not a url", "https://lab.example")).toBe(
      "not a url",
    );
  });
});

describe("projectDrivesIntoConnect", () => {
  it("projects created drives first, merged with configured, preserve-all", () => {
    const projected = projectDrivesIntoConnect({
      createdDriveUrls: [
        "http://localhost:7064/d/vetra-abc",
        null,
        "http://localhost:7064/d/workflows-abc",
      ],
      configuredDefaultDrives: [
        remote("http://localhost:7064/d/vetra-abc", "Configured dup"),
        remote("https://other.example/d/team"),
      ],
    });
    expect(projected.drives).toEqual({
      defaultDrives: [
        { url: "http://localhost:7064/d/vetra-abc", name: null, icon: null },
        {
          url: "http://localhost:7064/d/workflows-abc",
          name: null,
          icon: null,
        },
        { url: "https://other.example/d/team", name: null, icon: null },
      ],
      preserveStrategy: "preserve-all",
    });
  });

  it("rebases created drives onto the public base when given", () => {
    const projected = projectDrivesIntoConnect({
      createdDriveUrls: ["http://localhost:7064/d/vetra-abc"],
      publicBase: "https://lab.example",
    });
    expect(projected.drives?.defaultDrives?.[0]).toEqual({
      url: "https://lab.example/d/vetra-abc",
      name: null,
      icon: null,
    });
  });
});

describe("placeConnectDrives", () => {
  const reactor = {
    backends: {
      main: { kind: "worker" as const },
      sb: {
        kind: "remote" as const,
        remote: { url: "http://localhost:4001/d/b" },
      },
      other: {
        kind: "remote" as const,
        remote: { url: "http://localhost:4002/api/d/home" },
      },
    },
  };

  it("annotates each remote drive with the backend serving it", () => {
    const placed = placeConnectDrives(reactor, [
      remote("http://localhost:4001/d/b"),
      remote("http://localhost:4002/api/d/c"),
      remote("http://elsewhere/d/x"),
      local("drive-a"),
    ]);
    expect(placed.defaultDrives).toEqual([
      { ...remote("http://localhost:4001/d/b"), backend: "sb" },
      { ...remote("http://localhost:4002/api/d/c"), backend: "other" },
      remote("http://elsewhere/d/x"),
      local("drive-a"),
    ]);
    expect(placed.collections).toBeUndefined();
  });

  it("keeps no copy of a drive placed on its switchboard", () => {
    const placed = placeConnectDrives(
      { ...reactor, placement: { drives: { b: "sb", c: "main" } } },
      [
        remote("http://localhost:4001/d/b"),
        remote("http://localhost:4001/d/c"),
      ],
    );
    expect(placed.defaultDrives).toEqual([
      { ...remote("http://localhost:4001/d/b"), backend: "sb", sync: false },
      { ...remote("http://localhost:4001/d/c"), backend: "sb" },
    ]);
  });

  it("matches a declared slug to its hashed served slug", () => {
    const placed = placeConnectDrives(
      { ...reactor, placement: { drives: { b: "sb" } } },
      [remote("http://localhost:4001/d/b-0123abcd")],
    );
    expect(placed.defaultDrives[0]).toMatchObject({
      backend: "sb",
      sync: false,
    });
  });

  it("lists placed drives that are not default drives as collections", () => {
    const placed = placeConnectDrives(
      {
        ...reactor,
        placement: { drives: { b: "sb", workflows: "sb", notes: "main" } },
      },
      [remote("http://localhost:4001/d/b")],
    );
    expect(placed.collections).toEqual({
      workflows: { backend: "sb", sync: false },
    });
  });

  it("leaves the drives alone without remote backends", () => {
    const drives = [remote("http://localhost:4001/d/b"), local("a")];
    expect(
      placeConnectDrives({ backends: { main: { kind: "worker" } } }, drives),
    ).toEqual({ defaultDrives: drives });
    expect(placeConnectDrives(undefined, drives)).toEqual({
      defaultDrives: drives,
    });
  });
});
