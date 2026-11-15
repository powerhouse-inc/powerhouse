import { describe, expect, it } from "vitest";
import {
  adjustAllowlist,
  diffShapes,
  expectOnlyAllowedDifferences,
  judgeDifferences,
  overlayOf,
  relocate,
  shapeOf,
  type AllowedDifference,
} from "./parity-gate.js";

const classic = shapeOf({
  port: 4001,
  mcp: true,
  dbPath: undefined,
  seeds: {},
});
const hosts = shapeOf({
  port: 7650,
  mcp: true,
  seeds: { powerhouse: { slug: "powerhouse", icon: undefined } },
});
const differences = diffShapes(classic, hosts);

const LISTED: AllowedDifference[] = [
  { paths: ["port"], classic: "4001", hosts: "7650", reason: "the config" },
  { paths: ["dbPath"], hosts: "<absent>", reason: "passed unset" },
  { paths: ["seeds.powerhouse.*"], reason: "the declared drive" },
];

describe("parity gate", () => {
  it("tells a key passed as undefined from a key left out", () => {
    expect(differences).toContainEqual({
      path: "dbPath",
      classic: "undefined",
      hosts: "<absent>",
    });
  });

  it("reports the leaves under an empty container, not the container", () => {
    expect(differences.map((difference) => difference.path)).toEqual([
      "dbPath",
      "port",
      "seeds.powerhouse.icon",
      "seeds.powerhouse.slug",
    ]);
  });

  it("renders opaque paths by presence and normalizes strings and keys", () => {
    const shape = shapeOf(
      { logger: { level: 1 }, none: undefined, "drive-abc": "/tmp/x/abc" },
      {
        opaque: ["logger", "none"],
        normalize: (text) => text.replaceAll("abc", "<hash>"),
      },
    );
    expect(Object.fromEntries(shape)).toEqual({
      logger: "<opaque>",
      none: "undefined",
      "drive-<hash>": '"/tmp/x/<hash>"',
    });
  });

  it("passes while the two sides differ exactly as listed", () => {
    expect(() =>
      expectOnlyAllowedDifferences("gate", differences, LISTED),
    ).not.toThrow();
  });

  it("fails on a difference nobody listed", () => {
    const list = adjustAllowlist(LISTED, { dropped: ["dbPath"] });
    expect(judgeDifferences(differences, list).unlisted).toEqual([
      { path: "dbPath", classic: "undefined", hosts: "<absent>" },
    ]);
    expect(() =>
      expectOnlyAllowedDifferences("gate", differences, list),
    ).toThrow(/Not listed[^]*"dbPath": classic undefined \| hosts <absent>/);
  });

  it("fails on a listed difference that no longer shows", () => {
    const list = adjustAllowlist(LISTED, {
      added: [{ paths: ["mcp", "seeds.vetra.*"], reason: "gone" }],
    });
    expect(
      judgeDifferences(differences, list).stale.map((entry) => entry.path),
    ).toEqual(["mcp", "seeds.vetra.*"]);
    expect(() =>
      expectOnlyAllowedDifferences("gate", differences, list),
    ).toThrow(/no longer different[^]*"mcp" \(gone\)/);
  });

  it("fails when a pinned side is no longer what was listed", () => {
    const list = adjustAllowlist(LISTED, {
      dropped: ["port"],
      added: [{ paths: ["port"], hosts: "4001", reason: "the config" }],
    });
    expect(judgeDifferences(differences, list).mismatched).toHaveLength(1);
    expect(() =>
      expectOnlyAllowedDifferences("gate", differences, list),
    ).toThrow(/Listed with other values[^]*"port": classic 4001 \| hosts 7650/);
  });

  it("refuses to drop a path the base list does not have", () => {
    expect(() => adjustAllowlist(LISTED, { dropped: ["nope"] })).toThrow(
      /Not in the base list: nope/,
    );
  });

  it("takes what a config adds to the one both sides started from", () => {
    const base = { drives: { defaultDrives: [], strategy: "a" }, title: "T" };
    expect(
      overlayOf(
        {
          drives: { defaultDrives: [{ id: "x" }], strategy: "a" },
          title: "T",
          app: { cookieBanner: false },
        },
        base,
      ),
    ).toEqual({
      drives: { defaultDrives: [{ id: "x" }] },
      app: { cookieBanner: false },
    });
    expect(overlayOf(base, base)).toBeUndefined();
  });

  it("compares a fact the two sides carry at different places", () => {
    const options = shapeOf({
      options: { config: { drive: "a", ask: false } },
    });
    const moves = [
      { from: "plugins.3.config", to: "options.config", reason: "" },
    ];
    const entry = (config: unknown) =>
      relocate(shapeOf({ plugins: [0, 1, 2, { config }] }), moves);
    expect(diffShapes(options, entry({ drive: "a", ask: false }))).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ path: "options.config.drive" }),
      ]),
    );
    expect(
      diffShapes(options, entry({ drive: "b", ask: false })),
    ).toContainEqual({
      path: "options.config.drive",
      classic: JSON.stringify("a"),
      hosts: JSON.stringify("b"),
    });
    // The fact is gone from where the list says it is.
    expect(() => relocate(shapeOf({ plugins: [] }), moves)).toThrow(
      /Nothing at plugins.3.config/,
    );
    // Both places hold it: neither is silently dropped.
    expect(() =>
      relocate(
        shapeOf({
          options: { config: { drive: "a" } },
          plugins: [0, 1, 2, { config: { drive: "a" } }],
        }),
        moves,
      ),
    ).toThrow(/already there/);
  });
});
