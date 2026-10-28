import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { BARE, FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import { ladderFlags } from "./flags.js";
import { FOLDER_REASONS, SETTINGS_ELSEWHERE } from "./policy.js";
import type { HostRulesContext, HostEnv } from "./schema.js";
import { applySetters } from "./setters.js";
import {
  onOff,
  REASONS,
  shapeWording,
  validateDraft,
  workerCount,
} from "./validate.js";

const SB = "host.children.sb";
const SB_REACTOR = "members.switchboard.reactor";
const UI_REACTOR = "members.connect.reactor";

function draft(
  setters: Record<string, unknown> = {},
  base: HostExport = stack(),
): HostExport {
  const applied = applySetters(
    base,
    Object.entries(setters).map(([path, value]) => ({
      path,
      value: value as never,
    })),
  );
  expect(applied.issues).toEqual([]);
  return applied.envelope;
}

function issues(
  envelope: HostExport,
  env: HostEnv = {},
  context: HostRulesContext = FULL,
) {
  return validateDraft({ envelope, env }, context).issues.map(
    ({ rule, path, message }) => [rule, path, message],
  );
}

const postgres = {
  [`${SB_REACTOR}.backends.main`]: {
    kind: "in-process",
    storage: { kind: "postgres" },
  },
};

describe("validateDraft", () => {
  it("passes the scaffold stack", () => {
    expect(issues(stack())).toEqual([]);
    expect(issues(hostExport("desktop"))).toEqual([]);
    expect(issues(hostExport("connect"))).toEqual([]);
  });

  it("refuses a host name that would escape the run folder", () => {
    for (const path of ["host.name", "members.switchboard.name"]) {
      expect(
        issues(draft({ [path]: "../../escape" })).filter(
          ([rule, at]) => rule === "shape" && at === path,
        ),
      ).toHaveLength(1);
    }
  });

  it("needs a controller to start a switchboard", () => {
    expect(issues(stack(), {}, { postgres: true, controller: false })).toEqual([
      ["capability", SB, REASONS.noController],
    ]);
  });

  describe("env", () => {
    it("refuses keys the monitor doesn't pass", () => {
      expect(
        issues(stack(), { NODE_OPTIONS: "--x", LOG_LEVEL: "debug" }),
      ).toEqual([
        [
          "env",
          `env.NODE_OPTIONS`,
          "NODE_OPTIONS loads code, so only the controller's config can set it.",
        ],
      ]);
    });

    it("refuses a worker count that isn't a number", () => {
      expect(issues(stack(), { REACTOR_WORKERS: "lots" })).toEqual([
        ["env", `env.REACTOR_WORKERS`, REASONS.workersValue],
      ]);
      expect([
        workerCount("0"),
        workerCount(" 2 "),
        workerCount("auto"),
        workerCount("-1"),
      ]).toEqual([0, 2, Number.POSITIVE_INFINITY, undefined]);
    });
  });

  describe("access control", () => {
    it("applies the ladder to flags from env", () => {
      expect(issues(stack(), { REACTOR_AUTH_GROUPS: "true" })).toEqual([
        [
          "protocol",
          `env.REACTOR_AUTH_GROUPS`,
          "REACTOR_AUTH_GROUPS=true disagrees with the host's setting (false), so sb won't start.",
        ],
        [
          "ladder",
          `env.REACTOR_AUTH_GROUPS`,
          "Groups needs Permissions turned on, or sb won't start.",
        ],
      ]);
    });

    it("refuses env that turns a host flag off", () => {
      const envelope = draft({
        [`${SB_REACTOR}.protocol.featureFlags`]: ladderFlags(2),
        [`${UI_REACTOR}.protocol.featureFlags`]: ladderFlags(2),
      });
      expect(issues(envelope, { REACTOR_AUTH_ENFORCEMENT: "false" })).toEqual([
        [
          "protocol",
          `env.REACTOR_AUTH_ENFORCEMENT`,
          "REACTOR_AUTH_ENFORCEMENT=false disagrees with the host's setting (true), so sb won't start.",
        ],
      ]);
      expect(issues(envelope, { REACTOR_AUTH_ENFORCEMENT: "true" })).toEqual(
        [],
      );
    });

    it("applies the ladder to the protocol block", () => {
      const groups = { ...ladderFlags(0), authGroups: true };
      const envelope = draft({
        [`${SB_REACTOR}.protocol.featureFlags`]: groups,
        [`${UI_REACTOR}.protocol.featureFlags`]: groups,
      });
      expect(issues(envelope)).toEqual([
        [
          "ladder",
          `${SB_REACTOR}.protocol.featureFlags.authGroups`,
          "Groups needs Permissions turned on, or sb won't start.",
        ],
        [
          "ladder",
          `${UI_REACTOR}.protocol.featureFlags.authGroups`,
          "Groups needs Permissions turned on, or ui won't start.",
        ],
      ]);
    });

    it("keeps access control the same on reactors that sync", () => {
      const envelope = draft(
        { [`${SB_REACTOR}.protocol.featureFlags`]: ladderFlags(1) },
        hostExport("cli"),
      );
      expect(issues(envelope)).toEqual([
        [
          "protocol",
          "host.children.cli-connect.reactor.protocol.featureFlags",
          "cli-connect syncs with cli-switchboard, so both need the same access control. Set cli-connect's to match cli-switchboard's.",
        ],
      ]);
    });

    it("lets reactors that don't sync differ", () => {
      const envelope = draft({
        [`${SB_REACTOR}.protocol.featureFlags`]: ladderFlags(1),
      });
      expect(issues(envelope)).toEqual([]);
      const twoSwitchboards = draft({
        "host.children.sb2": {
          host: "switchboard",
          runner: { port: 0 },
          reactor: {
            protocol: { featureFlags: ladderFlags(2) },
            backends: {
              main: {
                kind: "in-process",
                storage: { kind: "path", dataDir: ".ph/sb2/reactor-storage" },
                readModel: { url: ".ph/sb2/read-storage" },
              },
            },
          },
        },
      });
      expect(issues(twoSwitchboards)).toEqual([]);
    });

    it("ignores a member block a wrapper replaces", () => {
      const envelope = draft(
        {
          "members.connect.reactor.protocol.featureFlags": {
            authConditions: true,
          },
        },
        hostExport("cli"),
      );
      expect(issues(envelope)).toEqual([]);
    });
  });

  describe("storage", () => {
    it.each<[string, Record<string, unknown>, [string, string, string][]]>([
      [
        "a switchboard on a folder",
        {
          [`${SB_REACTOR}.backends.main`]: {
            kind: "in-process",
            storage: { kind: "path" },
          },
        },
        [],
      ],
      [
        "a switchboard on browser storage",
        {
          [`${SB_REACTOR}.backends.main`]: {
            kind: "in-process",
            storage: { kind: "idb" },
          },
        },
        [
          [
            "storage",
            `${SB_REACTOR}.backends.main.storage.kind`,
            "A switchboard can't use browser storage. Use a folder on disk or Postgres.",
          ],
        ],
      ],
      [
        "a switchboard in memory",
        {
          [`${SB_REACTOR}.backends.main`]: {
            kind: "in-process",
            storage: { kind: "memory" },
          },
        },
        [
          [
            "storage",
            `${SB_REACTOR}.backends.main.storage.kind`,
            "A switchboard ignores in-memory storage and keeps its data in a folder on disk.",
          ],
        ],
      ],
      [
        "a switchboard's Postgres with its own address",
        {
          [`${SB_REACTOR}.backends.main`]: {
            kind: "in-process",
            storage: { kind: "postgres", url: "postgres://x/db" },
          },
        },
        [
          [
            "postgres",
            `${SB_REACTOR}.backends.main.storage.url`,
            REASONS.postgresUrl,
          ],
        ],
      ],
      [
        "Connect in a folder",
        { [`${UI_REACTOR}.backends.main.storage.kind`]: "path" },
        [
          [
            "storage",
            `${UI_REACTOR}.backends.main.storage.kind`,
            "Only a switchboard can store in a folder.",
          ],
        ],
      ],
      [
        "Connect on Postgres",
        { [`${UI_REACTOR}.backends.main.storage.kind`]: "postgres" },
        [
          [
            "storage",
            `${UI_REACTOR}.backends.main.storage.kind`,
            "A browser can't reach Postgres. Sync with a switchboard that uses it instead.",
          ],
        ],
      ],
      [
        "a browser reactor saved with a switchboard, in a folder",
        {
          [`${SB_REACTOR}.backends`]: {
            main: { kind: "in-process" },
            tab: { kind: "worker", storage: { kind: "path" } },
          },
        },
        [
          [
            "storage",
            `${SB_REACTOR}.backends.tab.storage.kind`,
            "Only a switchboard can store in a folder.",
          ],
        ],
      ],
    ])("%s", (_name, setters, expected) => {
      expect(issues(draft(setters))).toEqual(expected);
    });

    it("needs the controller's Postgres", () => {
      expect(issues(draft(postgres))).toEqual([]);
      expect(issues(draft(postgres), {}, BARE)).toEqual([
        [
          "capability",
          `${SB_REACTOR}.backends.main.storage.kind`,
          REASONS.noPostgres,
        ],
      ]);
    });
  });

  describe("background workers", () => {
    const workers = (count: string) => ({ REACTOR_WORKERS: count });

    it("needs Postgres storage", () => {
      expect(issues(stack(), workers("2"))).toEqual([
        ["workers", `env.REACTOR_WORKERS`, REASONS.workersStorage],
      ]);
      expect(issues(stack(), workers("auto"))).toEqual([
        ["workers", `env.REACTOR_WORKERS`, REASONS.workersStorage],
      ]);
      expect(issues(stack(), workers("0"))).toEqual([]);
      expect(issues(draft(postgres), workers("2"))).toEqual([]);
    });

    it("keeps the search data folder apart from Postgres storage", () => {
      const envelope = draft({
        [`${SB_REACTOR}.backends.main`]: {
          kind: "in-process",
          storage: { kind: "postgres" },
          readModel: { url: "./.ph/read-storage" },
        },
      });
      expect(issues(envelope, workers("2"))).toEqual([]);
    });

    it("reads the switchboard's own settings, under the host's env", () => {
      const at = "members.switchboard.config.switchboard";
      const own = (workers: Record<string, unknown>) =>
        draft({ "members.switchboard.config.switchboard.workers": workers });
      expect(issues(own({ executor: { count: 2 } }))).toEqual([
        ["workers", `${at}.workers.executor.count`, REASONS.workersStorage],
      ]);
      expect(issues(own({ projection: { enabled: true } }))).toEqual([
        [
          "workers",
          `${at}.workers.projection.enabled`,
          REASONS.projectionStorage,
        ],
      ]);
      expect(issues(own({ executor: { count: "auto" } }), {}, FULL)).toEqual([
        ["workers", `${at}.workers.executor.count`, REASONS.workersStorage],
      ]);
      expect(issues(own({ executor: { count: 2 } }), workers("0"))).toEqual([]);
      expect(
        issues(
          draft({
            ...postgres,
            "members.switchboard.config.switchboard.workers.executor.count": 2,
          }),
        ),
      ).toEqual([]);
    });

    it("can't run with hot reload", () => {
      expect(
        issues(draft(postgres), workers("2"), { ...FULL, verb: "dev" }),
      ).toEqual([["workers", `env.REACTOR_WORKERS`, REASONS.workersDev]]);
    });

    it("can't check signatures with permissions on and local credentials", () => {
      const envelope = draft({
        ...postgres,
        [`${SB_REACTOR}.protocol.featureFlags`]: ladderFlags(2),
        [`${UI_REACTOR}.protocol.featureFlags`]: ladderFlags(2),
      });
      expect(
        issues(envelope, workers("2"), { ...FULL, renownSource: "self" }),
      ).toEqual([["workers", `env.REACTOR_WORKERS`, REASONS.workersTrust]]);
      expect(issues(envelope, workers("2"))).toEqual([]);
    });

    it("holds the separate search thread to the same rules", () => {
      const on = { REACTOR_PROJECTION_WORKER: "TRUE" };
      expect(issues(stack(), on)).toEqual([
        ["workers", `env.REACTOR_PROJECTION_WORKER`, REASONS.projectionStorage],
      ]);
      expect(issues(draft(postgres), on, { ...FULL, verb: "dev" })).toEqual([
        ["workers", `env.REACTOR_PROJECTION_WORKER`, REASONS.projectionDev],
      ]);
      expect(issues(stack(), { REACTOR_PROJECTION_WORKER: "0" })).toEqual([]);
    });
  });

  describe("several switchboards", () => {
    const SB2 = "host.children.sb2";
    const SB2_MAIN = `${SB2}.reactor.backends.main`;

    function second(
      main: Record<string, unknown>,
      runner: Record<string, unknown> = { port: 0 },
    ): HostExport {
      return draft({
        [SB2]: {
          host: "switchboard",
          runner,
          reactor: { backends: { main: { kind: "in-process", ...main } } },
        },
      });
    }

    const own = {
      storage: { kind: "path", dataDir: ".ph/sb2/reactor-storage" },
      readModel: { url: ".ph/sb2/read-storage" },
    };

    it("runs two switchboards with their own stores and ports", () => {
      expect(issues(second(own))).toEqual([]);
      expect(issues(second(own, { port: 4002 }))).toEqual([]);
      const builtIn = validateDraft({ envelope: second(own) }, FULL).members;
      expect(builtIn.map((member) => member.role)).toEqual([
        "switchboard",
        "connect",
        "switchboard",
      ]);
    });

    it("refuses two switchboards that share a storage folder", () => {
      const shared = second({
        ...own,
        storage: { kind: "path", dataDir: ".ph/reactor-storage" },
      });
      const found = validateDraft({ envelope: shared }, FULL).issues;
      expect(
        found.map(({ rule, path, message, hint }) => [
          rule,
          path,
          message,
          hint,
        ]),
      ).toEqual([
        [
          "storage",
          `${SB2_MAIN}.storage.dataDir`,
          "sb2 and sb would keep their data in the same folder, which corrupts both. Give sb2 its own storage folder.",
          ".ph/reactor-storage",
        ],
      ]);
      // ${userData} and the project root are one place under `ph run`.
      expect(
        issues(
          second({
            ...own,
            storage: {
              kind: "path",
              dataDir: "${userData}/./.ph/reactor-storage/",
            },
          }),
        ),
      ).toHaveLength(1);
    });

    it("refuses two switchboards that share a search data folder", () => {
      expect(
        issues(second({ ...own, readModel: { url: ".ph/read-storage" } })),
      ).toEqual([
        [
          "storage",
          `${SB2_MAIN}.readModel.url`,
          "sb2 and sb would keep their search data in the same folder, which corrupts both. Give sb2 its own search data folder.",
        ],
      ]);
    });

    it("refuses one switchboard's store in another's search data folder", () => {
      expect(
        issues(
          second({
            ...own,
            storage: { kind: "path", dataDir: ".ph/read-storage" },
          }),
        ),
      ).toEqual([
        [
          "storage",
          `${SB2_MAIN}.storage.dataDir`,
          "sb2 and sb would keep their data in the same folder, which corrupts both. Give sb2 its own storage folder.",
        ],
      ]);
    });

    it("refuses two switchboards on the default folders", () => {
      expect(issues(second({}))).toEqual([
        [
          "storage",
          SB2,
          "sb2 and sb would keep their data in the same folder, which corrupts both. Give sb2 its own storage folder.",
        ],
        [
          "storage",
          SB2,
          "sb2 and sb would keep their search data in the same folder, which corrupts both. Give sb2 its own search data folder.",
        ],
      ]);
    });

    it("refuses two switchboards with one set of reactor settings", () => {
      const twin = draft({
        [SB2]: { host: "switchboard", runner: { port: 0 } },
      });
      expect(issues(twin)).toEqual([
        [
          "storage",
          SB2,
          "sb2 and sb share one set of reactor settings, so they would keep their data in the same place, which corrupts both. Give sb2 its own reactor settings.",
        ],
      ]);
    });

    it("lets only one switchboard use the controller's Postgres", () => {
      const both = draft(
        postgres,
        second({ ...own, storage: { kind: "postgres" } }),
      );
      expect(issues(both)).toEqual([
        [
          "storage",
          `${SB2_MAIN}.storage.kind`,
          "sb2 and sb would both keep their data in the controller's Postgres database, so each would change the other's documents. Only one switchboard in a host can use it.",
        ],
      ]);
      expect(issues(draft(postgres, second(own)))).toEqual([]);
    });

    it("refuses two switchboards on one port", () => {
      expect(issues(second(own, { port: 7491 }))).toEqual([
        [
          "port",
          `${SB2}.runner.port`,
          "sb2 and sb would both use port 7491. Give sb2 its own port.",
        ],
      ]);
      expect(issues(second(own, { port: 6491 }))).toEqual([
        [
          "port",
          `${SB2}.runner.port`,
          "sb2 and ui would both use port 6491. Give sb2 its own port.",
        ],
      ]);
    });

    it("takes the default port when a switchboard names none", () => {
      const defaults = draft(
        { "members.switchboard.runner.port": { $delete: true } },
        second(own, {}),
      );
      expect(issues(defaults)).toEqual([
        [
          "port",
          `${SB2}.runner.port`,
          "sb2 and sb would both use port 4001. Give sb2 its own port.",
        ],
      ]);
    });
  });

  describe("switchboard settings", () => {
    const AT = "members.switchboard.config.switchboard";

    it.each(
      SETTINGS_ELSEWHERE.map(([pattern, reason]) => [
        pattern.filter((part) => part !== "**").join("."),
        reason,
      ]),
    )("refuses %s, which the switchboard reads elsewhere", (key, reason) => {
      const envelope = draft({ [`${AT}.${key}`]: true });
      expect(issues(envelope)).toContainEqual([
        "config",
        `${AT}.${key}`,
        reason,
      ]);
    });

    it("checks the values the builder writes", () => {
      expect(
        issues(draft({ [`${AT}.workers.executor.count`]: "lots" })),
      ).toEqual([
        ["config", `${AT}.workers.executor.count`, REASONS.workersValue],
      ]);
      expect(
        issues(draft({ [`${AT}.workers.projection.enabled`]: "yes" })),
      ).toEqual([
        ["config", `${AT}.workers.projection.enabled`, REASONS.projectionValue],
      ]);
    });

    it("refuses workflows turned on or off in two places", () => {
      const envelope = draft({
        [`${AT}.features.workflows`]: true,
        [`${SB_REACTOR}.workflows`]: false,
      });
      expect(issues(envelope)).toContainEqual([
        "config",
        `${AT}.features.workflows`,
        REASONS.workflowsTwice,
      ]);
    });

    it("says only a switchboard reads them", () => {
      const envelope = draft({
        "members.connect.config.switchboard.inspection.admin": true,
      });
      expect(issues(envelope)).toEqual([
        [
          "config",
          "members.connect.config.switchboard",
          REASONS.switchboardOnly,
        ],
      ]);
    });
  });

  describe("shape", () => {
    it("reports schema issues at envelope paths", () => {
      const envelope = draft(
        { "host.runner.port": 0 },
        hostExport("switchboard"),
      );
      const found = validateDraft({ envelope }, FULL).issues;
      expect(found).toMatchObject([
        {
          rule: "shape",
          path: "host.runner.port",
          file: "hosts/switchboard/host.js",
        },
      ]);
    });

    it("checks the start order against the members", () => {
      const envelope = draft({});
      (envelope.host as { config?: unknown }).config = {
        startOrder: ["sb", "ghost"],
      };
      expect(issues(envelope)).toEqual([
        [
          "shape",
          "host.config.startOrder.1",
          "The start order names a reactor this host doesn't have, or one twice.",
        ],
      ]);
    });
  });

  describe("round 2", () => {
    it("reads worker env exactly as the switchboard does", () => {
      expect(workerCount("007")).toBeUndefined();
      expect(issues(stack(), { REACTOR_WORKERS: "007" })).toEqual([
        ["env", `env.REACTOR_WORKERS`, REASONS.workersValue],
      ]);
      expect([
        onOff("Yes"),
        onOff(" off "),
        onOff(""),
        onOff(undefined),
        onOff("maybe"),
      ]).toEqual([true, false, false, false, undefined]);
      expect(issues(stack(), { REACTOR_PROJECTION_WORKER: "maybe" })).toEqual([
        ["env", `env.REACTOR_PROJECTION_WORKER`, REASONS.projectionValue],
      ]);
      expect(issues(stack(), { REACTOR_PROJECTION_WORKER: "false" })).toEqual(
        [],
      );
    });

    it("refuses switchboard env in a host without a switchboard", () => {
      const env = {
        REACTOR_AUTH_GROUPS: "true",
        REACTOR_WORKERS: "2",
        REACTOR_PROJECTION_WORKER: "on",
      };
      expect(issues(hostExport("connect"), env)).toEqual([
        ["env", "env.REACTOR_WORKERS", REASONS.workersNoSwitchboard],
        [
          "env",
          "env.REACTOR_PROJECTION_WORKER",
          REASONS.projectionNoSwitchboard,
        ],
        ["env", "env.REACTOR_AUTH_GROUPS", REASONS.envNoSwitchboard],
      ]);
    });

    it("reports a main backend that doesn't exist, once", () => {
      const envelope = draft({
        ...postgres,
        [`${SB_REACTOR}.placement.primary`]: "nope",
      });
      expect(issues(envelope, { REACTOR_WORKERS: "2" })).toEqual([
        [
          "storage",
          `${SB_REACTOR}.placement.primary`,
          'The main backend is set to "nope", which sb doesn\'t have, so sb would ignore its backends.',
        ],
      ]);
    });

    it("keeps a switchboard's folders inside the project's .ph folder", () => {
      const envelope = draft({
        [`${SB_REACTOR}.backends.main`]: {
          kind: "in-process",
          storage: { kind: "path", dataDir: "src/data" },
          readModel: { url: "postgres://evil.example:5432/x" },
        },
      });
      const found = validateDraft({ envelope }, FULL).issues;
      expect(
        found.map(({ path, message, hint }) => [path, message, hint]),
      ).toEqual([
        [
          `${SB_REACTOR}.backends.main.storage.dataDir`,
          FOLDER_REASONS.dataDir,
          "src/data",
        ],
        [
          `${SB_REACTOR}.backends.main.readModel.url`,
          FOLDER_REASONS.readModel,
          "postgres://evil.example:5432/x",
        ],
      ]);
    });

    it.each<[string, Record<string, unknown> | undefined, boolean]>([
      ["Postgres", { kind: "postgres" }, false],
      ["a folder", { kind: "path", dataDir: ".ph/store" }, false],
      ["a folder with no folder chosen", { kind: "path" }, true],
      ["the default folder", undefined, true],
    ])(
      "with %s, reports a search data folder that would hold the store: %s",
      (_name, storage, moves) => {
        const envelope = draft({
          [`${SB_REACTOR}.backends.main`]: {
            kind: "in-process",
            ...(storage ? { storage } : {}),
            readModel: { url: ".ph/read" },
          },
        });
        expect(issues(envelope)).toEqual(
          moves
            ? [
                [
                  "storage",
                  `${SB_REACTOR}.backends.main.readModel.url`,
                  REASONS.readModel,
                ],
              ]
            : [],
        );
      },
    );

    it("checks a storage folder taken from env against the host's env", () => {
      const envelope = draft({
        [`${SB_REACTOR}.backends.main`]: {
          kind: "in-process",
          storage: { kind: "path", dataDir: { $env: "REACTOR_DATA_DIR" } },
        },
      });
      const at = `${SB_REACTOR}.backends.main.storage.dataDir`;
      expect(issues(envelope, { REACTOR_DATA_DIR: ".ph/data" })).toEqual([]);
      expect(issues(envelope, { REACTOR_DATA_DIR: "/Users/me/repo" })).toEqual([
        ["storage", at, FOLDER_REASONS.dataDir],
      ]);
      expect(issues(envelope)).toEqual([
        [
          "env",
          at,
          "The storage folder comes from REACTOR_DATA_DIR, which isn't set in this host's environment.",
        ],
      ]);
      const optional = draft({
        [`${SB_REACTOR}.backends.main`]: {
          kind: "in-process",
          storage: {
            kind: "path",
            dataDir: { $env: { name: "REACTOR_DATA_DIR", optional: true } },
          },
        },
      });
      expect(issues(optional)).toEqual([]);
    });

    it("says when a member's own members aren't checked", () => {
      const envelope = draft(
        { "host.children.nested": { host: "cli" } },
        hostExport("cli"),
      );
      (envelope.members as Record<string, unknown>).cli = {
        name: "cli",
        runner: { module: "@powerhousedao/host-core/runners/compound" },
        children: { inner: { host: "switchboard" } },
      };
      expect(issues(envelope)).toContainEqual([
        "scope",
        "host.children.nested",
        REASONS.nested,
      ]);
    });

    it("words schema messages for people and keeps the original as a hint", () => {
      expect(shapeWording('Unrecognized key: "__proto__"')).toEqual({
        message: "A host file can't contain this setting.",
        hint: 'Unrecognized key: "__proto__"',
      });
      expect(shapeWording("Too small: expected number to be >0").message).toBe(
        "This value is out of range.",
      );
      expect(shapeWording("Invalid input: expected string").message).toBe(
        "This value isn't valid here.",
      );
      expect(
        shapeWording("readModel.url must not be the reactor's storage dir"),
      ).toEqual({
        message: "readModel.url must not be the reactor's storage dir",
      });
    });
  });

  it("groups issues by path", () => {
    const result = validateDraft(
      { envelope: stack(), env: { REACTOR_AUTH_GROUPS: "true" } },
      FULL,
    );
    expect(Object.keys(result.byPath)).toEqual([`env.REACTOR_AUTH_GROUPS`]);
    expect(
      result.byPath[`env.REACTOR_AUTH_GROUPS`].map((issue) => issue.rule),
    ).toEqual(["protocol", "ladder"]);
    expect(result.issues[0].file).toBeUndefined();
  });
});
