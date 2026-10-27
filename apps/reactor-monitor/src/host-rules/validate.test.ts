import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { BARE, FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import { ladderFlags } from "./flags.js";
import { FOLDER_REASONS } from "./policy.js";
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

    it("keeps one setting for the whole host", () => {
      const envelope = draft({
        [`${SB_REACTOR}.protocol.featureFlags`]: ladderFlags(1),
      });
      expect(issues(envelope)).toEqual([
        [
          "protocol",
          `${UI_REACTOR}.protocol.featureFlags`,
          "Access control has to be the same for every reactor in the host, but ui differs from sb.",
        ],
      ]);
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

    it("reports a search data folder once, as storage", () => {
      const envelope = draft({
        [`${SB_REACTOR}.backends.main`]: {
          kind: "in-process",
          storage: { kind: "postgres" },
          readModel: { url: "./.ph/read-storage" },
        },
      });
      expect(issues(envelope, workers("2"))).toEqual([
        [
          "storage",
          `${SB_REACTOR}.backends.main.readModel.url`,
          REASONS.readModel,
        ],
      ]);
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

    it("runs one switchboard per host, whatever its storage", () => {
      const message =
        "A host can run only one switchboard for now. All its reactors share one process, so sb2 would use sb's database and settings.";
      const shared = draft({ "host.children.sb2": { host: "switchboard" } });
      expect(issues(shared)).toEqual([
        ["storage", "host.children.sb2", message],
      ]);
      const ownFolder = draft({
        "host.children.sb2": {
          host: "switchboard",
          reactor: {
            backends: {
              main: {
                kind: "in-process",
                storage: { kind: "path", dataDir: ".ph/sb2" },
              },
            },
          },
        },
      });
      expect(issues(ownFolder)).toEqual([
        ["storage", "host.children.sb2", message],
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
          REASONS.readModel,
          "postgres://evil.example:5432/x",
        ],
      ]);
    });

    it.each([
      ["Postgres", { kind: "postgres" }],
      ["a folder", { kind: "path", dataDir: ".ph/store" }],
      ["the default folder", undefined],
    ])(
      "reports a search data folder that moves the store off %s",
      (_name, storage) => {
        const envelope = draft({
          [`${SB_REACTOR}.backends.main`]: {
            kind: "in-process",
            ...(storage ? { storage } : {}),
            readModel: { url: ".ph/read" },
          },
        });
        expect(issues(envelope)).toEqual([
          [
            "storage",
            `${SB_REACTOR}.backends.main.readModel.url`,
            REASONS.readModel,
          ],
        ]);
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
