import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import type { Setter } from "./schema.js";
import { applySetters } from "./setters.js";

function envelope(): HostExport {
  return {
    format: "ph-host-export",
    version: 1,
    project: { name: "p", root: "/project" },
    name: "studio",
    host: {
      name: "studio",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: { sb: { host: "switchboard" } },
    },
    members: {
      switchboard: {
        name: "sb",
        runner: {
          module: "@powerhousedao/ph-cli/runners/switchboard",
          port: 4001,
        },
        reactor: {
          backends: {
            main: {
              kind: "in-process",
              storage: { kind: "path", dataDir: { $env: "DATA_DIR" } },
            },
          },
          drives: [{ slug: "lab", name: "Lab" }],
        },
      },
    },
  } as HostExport;
}

function at(result: { envelope: HostExport }, path: string): unknown {
  let current: unknown = result.envelope;
  for (const segment of path.split(".")) {
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

const SB = "members.switchboard";

function apply(...setters: Setter[]) {
  return applySetters(envelope(), setters);
}

describe("applySetters", () => {
  it("creates missing objects along the path", () => {
    const result = apply({
      path: "members.switchboard.reactor.protocol.featureFlags.authGroups",
      value: true,
    });
    expect(result.issues).toEqual([]);
    expect(at(result, `${SB}.reactor.protocol`)).toEqual({
      featureFlags: { authGroups: true },
    });
  });

  it("replaces a value and a whole token", () => {
    const result = apply(
      { path: "members.switchboard.runner.port", value: 5000 },
      {
        path: "members.switchboard.reactor.backends.main.storage.dataDir",
        value: "/tmp/x",
      },
    );
    expect(result.issues).toEqual([]);
    expect(at(result, `${SB}.runner.port`)).toBe(5000);
    expect(at(result, `${SB}.reactor.backends.main.storage.dataDir`)).toBe(
      "/tmp/x",
    );
  });

  it("deletes a key", () => {
    const result = apply({
      path: "members.switchboard.reactor.backends.main.storage.dataDir",
      value: { $delete: true },
    });
    expect(result.issues).toEqual([]);
    expect(at(result, `${SB}.reactor.backends.main.storage`)).toEqual({
      kind: "path",
    });
  });

  it("deletes a missing key without creating its parents", () => {
    const result = apply({
      path: "members.switchboard.reactor.backends.other.readModel",
      value: { $delete: true },
    });
    expect(result.issues).toEqual([]);
    expect(Object.keys(at(result, `${SB}.reactor.backends`) as object)).toEqual(
      ["main"],
    );
  });

  it("sets through an existing array index", () => {
    const result = apply({
      path: "members.switchboard.reactor.drives.0.name",
      value: "Renamed",
    });
    expect(result.issues).toEqual([]);
    expect(at(result, `${SB}.reactor.drives.0`)).toEqual({
      slug: "lab",
      name: "Renamed",
    });
  });

  it("sets a wrapper field under host.children", () => {
    const result = apply({ path: "host.children.sb.runner.port", value: 0 });
    expect(result.issues).toEqual([]);
    expect(at(result, "host.children.sb")).toEqual({
      host: "switchboard",
      runner: { port: 0 },
    });
  });

  it.each<[string, Setter, string]>([
    [
      "a path inside a token",
      {
        path: "members.switchboard.reactor.backends.main.storage.dataDir.$env",
        value: "X",
      },
      "members.switchboard.reactor.backends.main.storage.dataDir is a token",
    ],
    [
      "a path through a token",
      {
        path: "members.switchboard.reactor.backends.main.storage.dataDir.$env.name",
        value: "X",
      },
      "storage.dataDir is a token",
    ],
    [
      "an index past the end",
      { path: "members.switchboard.reactor.drives.1.name", value: "x" },
      "no index 1 (length 1)",
    ],
    [
      "a non-numeric index",
      { path: "members.switchboard.reactor.drives.first", value: "x" },
      "no index first",
    ],
    [
      "a last index past the end",
      { path: "members.switchboard.reactor.drives.3", value: {} },
      "no index 3",
    ],
    [
      "deleting an array element",
      {
        path: "members.switchboard.reactor.drives.0",
        value: { $delete: true },
      },
      "an array element cannot be deleted",
    ],
    [
      "a path through a primitive",
      { path: "members.switchboard.runner.port.value", value: 1 },
      "members.switchboard.runner.port is not an object",
    ],
    [
      "a missing member",
      { path: "members.ghost.runner.port", value: 1 },
      "members.ghost does not exist",
    ],
    [
      "a missing child",
      { path: "host.children.ghost.runner.port", value: 1 },
      "host.children.ghost does not exist",
    ],
    [
      "a prototype segment",
      { path: "host.__proto__.polluted", value: true },
      'segment "__proto__"',
    ],
    [
      "a constructor segment",
      { path: "host.constructor.x", value: true },
      'segment "constructor"',
    ],
    ["a bad root", { path: "project.root", value: "/" }, "must start at host"],
  ])("refuses %s", (_name, setter, message) => {
    const result = apply(setter);
    expect(result.issues).toEqual([
      {
        stage: "setter",
        path: setter.path,
        message: expect.stringContaining(message) as string,
      },
    ]);
  });

  it("reports every failing setter with its source and keeps the rest", () => {
    const result = applySetters(
      envelope(),
      [
        { path: "members.ghost.runner.port", value: 1 },
        { path: "members.switchboard.runner.port", value: 7 },
        { path: "members.switchboard.reactor.drives.9", value: 1 },
      ],
      [{ axis: "a", value: "x" }, {}, { axis: "b", value: "y" }],
    );
    expect(result.issues.map(({ axis, value }) => [axis, value])).toEqual([
      ["a", "x"],
      ["b", "y"],
    ]);
    expect(at(result, `${SB}.runner.port`)).toBe(7);
  });

  it("never touches the base or shares the setter value", () => {
    const base = envelope();
    const before = structuredClone(base);
    const value = { authGroups: true };
    const result = applySetters(base, [
      { path: "members.switchboard.reactor.protocol.featureFlags", value },
    ]);
    value.authGroups = false;
    expect(base).toEqual(before);
    expect(at(result, `${SB}.reactor.protocol.featureFlags`)).toEqual({
      authGroups: true,
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
