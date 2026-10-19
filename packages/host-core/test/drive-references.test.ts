import { describe, expect, it } from "vitest";
import { resolveDriveReferences } from "../src/compound.js";
import type { HostDefinition } from "../src/host-loader.js";
import { isDriveReference, unresolvedDriveReferences } from "../src/plugins.js";

// Workflow-plugins plan: `{ from: "<member>", slug }` in a plugin entry's
// config is a DRIVE REFERENCE the compound substitutes with the member's
// reported drive URL, so a connect member can derive the link to the
// switchboard's Workflows drive instead of spelling its URL.

const WF = "@powerhousedao/connect/plugins/workflows";

function connectHost(plugins: unknown[]): HostDefinition {
  return {
    name: "lab-connect",
    runner: { module: "fake-runner", plugins },
  } as HostDefinition;
}

const started = [
  {
    name: "app-switchboard",
    handle: {
      driveUrls: [
        "http://localhost:7064/d/powerhouse",
        "http://localhost:7064/d/workflows",
      ],
    },
  },
];
const members = ["app-switchboard", "app-connect"];

describe("drive references", () => {
  it("isDriveReference / unresolvedDriveReferences recognise the exact shape only", () => {
    expect(isDriveReference({ from: "a", slug: "b" })).toBe(true);
    expect(isDriveReference("http://x/d/b")).toBe(false);
    expect(isDriveReference({ from: "a" })).toBe(false);
    expect(isDriveReference({ from: "a", slug: "b", extra: 1 })).toBe(false);
    expect(
      unresolvedDriveReferences({
        drive: { from: "a", slug: "b" },
        name: "x",
      }),
    ).toEqual([{ key: "drive", reference: { from: "a", slug: "b" } }]);
    expect(unresolvedDriveReferences(undefined)).toEqual([]);
  });

  it("substitutes a reference with the member's URL for that slug", () => {
    const host = connectHost([
      "@powerhousedao/connect/plugins/generic",
      {
        module: WF,
        config: { drive: { from: "app-switchboard", slug: "workflows" } },
      },
    ]);
    const out = resolveDriveReferences(host, "app-connect", started, members);
    expect(out.runner.plugins).toEqual([
      "@powerhousedao/connect/plugins/generic",
      { module: WF, config: { drive: "http://localhost:7064/d/workflows" } },
    ]);
    // the input is not mutated
    expect((host.runner.plugins as unknown[])[1]).toEqual({
      module: WF,
      config: { drive: { from: "app-switchboard", slug: "workflows" } },
    });
  });

  it("leaves hosts without references untouched (same object)", () => {
    const literal = connectHost([
      { module: WF, config: { drive: "http://x/d/w" } },
    ]);
    expect(resolveDriveReferences(literal, "c", started, members)).toBe(
      literal,
    );
    const none = { name: "n", runner: { module: "m" } } as HostDefinition;
    expect(resolveDriveReferences(none, "c", started, members)).toBe(none);
  });

  it("names the fix when the member is declared but not started yet", () => {
    const host = connectHost([
      {
        module: WF,
        config: { drive: { from: "app-switchboard", slug: "workflows" } },
      },
    ]);
    expect(() =>
      resolveDriveReferences(host, "app-connect", [], members),
    ).toThrow(/starts after "app-connect"; list it first in config.startOrder/);
  });

  it("lists the members when the referenced member does not exist", () => {
    const host = connectHost([
      { module: WF, config: { drive: { from: "nope", slug: "workflows" } } },
    ]);
    expect(() =>
      resolveDriveReferences(host, "app-connect", started, members),
    ).toThrow(/member "nope".*Members declared: app-switchboard, app-connect/);
  });

  it("lists the member's drives when the slug is not served", () => {
    const host = connectHost([
      {
        module: WF,
        config: { drive: { from: "app-switchboard", slug: "flows" } },
      },
    ]);
    expect(() =>
      resolveDriveReferences(host, "app-connect", started, members),
    ).toThrow(/drive "flows".*serves "powerhouse", "workflows"/);
  });
});
