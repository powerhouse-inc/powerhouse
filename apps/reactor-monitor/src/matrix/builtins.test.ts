import type { HostExport } from "@powerhousedao/host-core/schema";
import type { ReactorFeatureFlags } from "@powerhousedao/reactor";
import { describe, expect, it } from "vitest";
import { axisValue, CAPS, hostExport, NO_PG } from "./__fixtures__/matrix.js";
import {
  capabilityIssues,
  conflicts,
  LADDER,
  ladderCombos,
  NEEDS_POSTGRES,
  reactorSites,
  requirements,
  storageModeCombos,
  valueAvailability,
  type FeatureFlag,
  type Selected,
} from "./builtins.js";
import type { AxisValue, Setter } from "./schema.js";

// The ladder mirrors the reactor's flags exactly.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameFlags: Same<FeatureFlag, keyof ReactorFeatureFlags> = true;
void sameFlags;

function pick(axis: string, value: AxisValue): Selected {
  return { axis: { key: axis, values: [value] }, value };
}

function set(path: string, value: Setter["value"]): Setter {
  return { path, value };
}

function reactorHost(
  reactor: Record<string, unknown>,
  module = "@powerhousedao/ph-cli/runners/switchboard",
): HostExport {
  return {
    format: "ph-host-export",
    version: 1,
    project: { name: "p", root: "/project" },
    name: "h",
    host: { name: "h", runner: { module }, reactor },
    members: {},
  } as HostExport;
}

const flags = (on: Partial<Record<FeatureFlag, boolean>>) => ({
  protocol: { featureFlags: on },
});

describe("conflicts", () => {
  it.each<[string, AxisValue, AxisValue, string[]]>([
    [
      "one path, two values",
      axisValue("x", { setters: [set("host.runner.port", 1)] }),
      axisValue("y", { setters: [set("host.runner.port", 2)] }),
      ["host.runner.port"],
    ],
    [
      "a set and a delete of one path",
      axisValue("x", { setters: [set("host.reactor.namespace", "n")] }),
      axisValue("y", {
        setters: [set("host.reactor.namespace", { $delete: true })],
      }),
      ["host.reactor.namespace"],
    ],
    [
      "a path and its prefix",
      axisValue("x", { setters: [set("host.reactor.protocol", {})] }),
      axisValue("y", {
        setters: [set("host.reactor.protocol.featureFlags.authGroups", true)],
      }),
      ["host.reactor.protocol.featureFlags.authGroups"],
    ],
    [
      "one env key, two values",
      axisValue("x", { env: { REACTOR_WORKERS: "0" } }),
      axisValue("y", { env: { REACTOR_WORKERS: "2" } }),
      ["env.REACTOR_WORKERS"],
    ],
    [
      "two attach kinds",
      axisValue("x", { attach: "remote" }),
      axisValue("y", { attach: "worker" }),
      ["attach"],
    ],
    [
      "two storage expectations",
      axisValue("x", { expect: { storageEngine: "pglite" } }),
      axisValue("y", { expect: { storageEngine: "postgres" } }),
      ["expect.storageEngine"],
    ],
  ])("flags %s", (_name, x, y, paths) => {
    const issues = conflicts([pick("a", x), pick("b", y)]);
    expect(issues.map((issue) => issue.path)).toEqual(paths);
    expect(issues[0]).toMatchObject({
      stage: "conflict",
      axis: "b",
      value: "y",
    });
    expect(issues[0].message).toContain("a=x and b=y both set");
  });

  it.each<[string, AxisValue, AxisValue]>([
    [
      "one path, one value",
      axisValue("x", {
        setters: [set("host.reactor.protocol", { a: 1, b: [2] })],
      }),
      axisValue("y", {
        setters: [set("host.reactor.protocol", { b: [2], a: 1 })],
      }),
    ],
    [
      "sibling paths that share a prefix string",
      axisValue("x", { setters: [set("host.runner.port", 1)] }),
      axisValue("y", { setters: [set("host.runner.portal", 2)] }),
    ],
    [
      "one env key, one value",
      axisValue("x", { env: { LOG_LEVEL: "debug" } }),
      axisValue("y", { env: { LOG_LEVEL: "debug" } }),
    ],
    [
      "one attach kind",
      axisValue("x", { attach: "remote" }),
      axisValue("y", { attach: "remote" }),
    ],
    [
      "one attach kind and none",
      axisValue("x", { attach: "remote" }),
      axisValue("y"),
    ],
  ])("allows %s", (_name, x, y) => {
    expect(conflicts([pick("a", x), pick("b", y)])).toEqual([]);
  });

  it("lets one value set a path and its prefix in order", () => {
    const value = axisValue("x", {
      setters: [
        set("host.reactor.protocol", {}),
        set("host.reactor.protocol.featureFlags", {}),
      ],
    });
    expect(conflicts([pick("a", value)])).toEqual([]);
  });
});

describe("reactorSites", () => {
  it("finds standalone, member and wrapper reactor blocks", () => {
    const sites = reactorSites(hostExport("cli"));
    expect(sites.map((site) => [site.at, site.switchboard])).toEqual([
      ["host.children.cli-connect.reactor", false],
      ["members.switchboard.reactor", true],
      ["members.connect.reactor", false],
    ]);
  });

  it("reads a wrapper's runner module before its member's", () => {
    const envelope = hostExport("cli");
    const host = envelope.host as {
      children: Record<string, Record<string, unknown>>;
    };
    host.children["cli-switchboard"].reactor = {};
    host.children["cli-switchboard"].runner = { module: "x/runners/connect" };
    const sites = reactorSites(envelope);
    expect(
      sites.find((site) => site.at.includes("cli-switchboard"))?.switchboard,
    ).toBe(false);
  });
});

describe("ladderCombos", () => {
  it.each(
    [0, 1, 2, 3, 4].map((rung) => [
      rung,
      Object.fromEntries(LADDER.map((flag, index) => [flag, index < rung])),
    ]),
  )("accepts the cumulative rung L%i", (_rung, on) => {
    expect(ladderCombos(reactorHost(flags(on)))).toEqual([]);
  });

  it.each<[Partial<Record<FeatureFlag, boolean>>, string[]]>([
    [{ authEnforcement: true }, ["authEnforcement requires documentDecisions"]],
    [
      { documentDecisions: true, authGroups: true },
      ["authGroups requires authEnforcement"],
    ],
    [{ authConditions: true }, ["authConditions requires authGroups"]],
    [
      { authConditions: true, authGroups: true },
      ["authGroups requires authEnforcement"],
    ],
    [
      { authConditions: true, authEnforcement: true },
      [
        "authEnforcement requires documentDecisions",
        "authConditions requires authGroups",
      ],
    ],
  ])("refuses %j", (on, messages) => {
    const combos = ladderCombos(reactorHost(flags(on)));
    expect(combos.map((combo) => combo.message)).toEqual(messages);
    expect(combos[0]).toMatchObject({
      rule: "ladder",
      path: expect.stringMatching(
        /^host\.reactor\.protocol\.featureFlags\./,
      ) as string,
    });
  });

  it("checks member and wrapper blocks too", () => {
    const envelope = hostExport("cli");
    const connect = envelope.members.connect as {
      reactor: Record<string, unknown>;
    };
    connect.reactor.protocol = { featureFlags: { authConditions: true } };
    expect(ladderCombos(envelope)).toEqual([
      {
        rule: "ladder",
        path: "members.connect.reactor.protocol.featureFlags.authConditions",
        message: "authConditions requires authGroups",
      },
    ]);
  });
});

describe("storageModeCombos", () => {
  const backends = (kind: string, storage?: string) => ({
    backends: {
      main: { kind, ...(storage ? { storage: { kind: storage } } : {}) },
    },
  });

  it.each<
    [
      string,
      string,
      string | undefined,
      "remote" | "in-process" | "worker",
      boolean,
    ]
  >([
    ["browser idb", "in-process", "idb", "in-process", true],
    ["browser memory", "worker", "memory", "worker", true],
    ["browser default storage", "in-process", undefined, "worker", true],
    ["browser path", "in-process", "path", "in-process", false],
    ["browser postgres", "in-process", "postgres", "worker", false],
    ["controller path", "in-process", "path", "remote", true],
    ["controller memory", "in-process", "memory", "remote", true],
    ["controller postgres", "in-process", "postgres", "remote", true],
    ["controller idb", "in-process", "idb", "remote", false],
  ])("%s → %s", (_name, kind, storage, attach, ok) => {
    const combos = storageModeCombos(
      reactorHost(backends(kind, storage)),
      attach,
    );
    expect(combos.length === 0).toBe(ok);
    if (!ok) {
      expect(combos[0]).toMatchObject({
        rule: "storage-mode",
        path: "host.reactor.backends.main.storage.kind",
      });
    }
  });

  it("ignores remote backends", () => {
    const reactor = {
      backends: { sb: { kind: "remote", storage: { kind: "path" } } },
    };
    expect(storageModeCombos(reactorHost(reactor), "in-process")).toEqual([]);
  });

  it("constrains only switchboards in controller cells", () => {
    const connect = reactorHost(
      backends("in-process", "idb"),
      "@powerhousedao/ph-cli/runners/connect",
    );
    expect(storageModeCombos(connect, "remote")).toEqual([]);
    expect(storageModeCombos(connect, "in-process")).toEqual([]);
    const path = reactorHost(
      backends("in-process", "path"),
      "@powerhousedao/ph-cli/runners/connect",
    );
    expect(storageModeCombos(path, "remote")).toEqual([]);
    expect(storageModeCombos(path, "worker")).toHaveLength(1);
  });
});

describe("requirements", () => {
  const pg = reactorHost({
    backends: { main: { kind: "in-process", storage: { kind: "postgres" } } },
  });

  it("collects explicit requirements", () => {
    const selected = [pick("a", axisValue("x", { requires: ["postgres"] }))];
    expect(requirements(reactorHost({}), selected, "in-process")).toEqual([
      "postgres",
    ]);
  });

  it("derives postgres from a spawned switchboard's storage", () => {
    expect(requirements(pg, [], "remote")).toEqual(["postgres"]);
    expect(
      requirements(
        pg,
        [pick("a", axisValue("x", { requires: ["postgres"] }))],
        "remote",
      ),
    ).toEqual(["postgres"]);
  });

  it("derives nothing for browser cells or other runners", () => {
    expect(requirements(pg, [], "in-process")).toEqual([]);
    const connect = reactorHost(
      {
        backends: {
          main: { kind: "in-process", storage: { kind: "postgres" } },
        },
      },
      "@powerhousedao/ph-cli/runners/connect",
    );
    expect(requirements(connect, [], "remote")).toEqual([]);
  });

  it("is unmet only without the capability", () => {
    expect(capabilityIssues(["postgres"], CAPS)).toEqual([]);
    expect(capabilityIssues([], NO_PG)).toEqual([]);
    expect(capabilityIssues(["postgres"], NO_PG)).toEqual([
      { stage: "capability", path: "", message: NEEDS_POSTGRES },
    ]);
  });
});

describe("valueAvailability", () => {
  const storage = (kind: string) =>
    axisValue(kind, {
      setters: [set("host.reactor.backends.main.storage.kind", kind)],
    });

  it.each<
    [
      string,
      AxisValue,
      typeof CAPS | typeof NO_PG,
      "remote" | "worker",
      string | undefined,
    ]
  >([
    [
      "postgres with the capability",
      storage("postgres"),
      CAPS,
      "remote",
      undefined,
    ],
    [
      "postgres without it",
      storage("postgres"),
      NO_PG,
      "remote",
      NEEDS_POSTGRES,
    ],
    [
      "explicit postgres without it",
      axisValue("x", { requires: ["postgres"] }),
      NO_PG,
      "remote",
      NEEDS_POSTGRES,
    ],
    ["path for the controller", storage("path"), NO_PG, "remote", undefined],
    [
      "path for the browser",
      storage("path"),
      NO_PG,
      "worker",
      'storage "path" is not offered for browser-provisioned cells',
    ],
    [
      "idb for the controller",
      storage("idb"),
      NO_PG,
      "remote",
      'storage "idb" is not offered for controller-spawned cells',
    ],
    ["idb for the browser", storage("idb"), NO_PG, "worker", undefined],
    [
      "postgres for the browser",
      storage("postgres"),
      CAPS,
      "worker",
      'storage "postgres" is not offered for browser-provisioned cells',
    ],
    [
      "a value's own attach",
      axisValue("x", {
        attach: "worker",
        setters: [set("host.reactor.backends.main.storage.kind", "path")],
      }),
      NO_PG,
      "remote",
      'storage "path" is not offered for browser-provisioned cells',
    ],
    [
      "an env-only value",
      axisValue("x", { env: { REACTOR_WORKERS: "2" } }),
      NO_PG,
      "remote",
      undefined,
    ],
  ])("%s", (_name, value, capabilities, attach, reason) => {
    expect(valueAvailability(value, capabilities, attach)).toEqual(
      reason === undefined ? { available: true } : { available: false, reason },
    );
  });
});
