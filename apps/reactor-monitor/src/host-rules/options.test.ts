import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { BARE, FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import { ladderFlags } from "./flags.js";
import {
  ADD_REASONS,
  applyOption,
  HOT_RELOAD_REASONS,
  hostOptionList,
  hostOptions,
  type OptionStatus,
  WORKER_COUNTS,
} from "./options.js";
import { checkSetter } from "./policy.js";
import type { HostDraft, HostRulesContext } from "./schema.js";
import { applySetters } from "./setters.js";
import { REASONS, validateDraft } from "./validate.js";

const SB = "host.children.sb";
const UI = "host.children.ui";
const SB_MAIN = "members.switchboard.reactor.backends.main";

function withSetters(
  setters: Record<string, unknown>,
  base = stack(),
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

function statuses(draft: HostDraft, context: HostRulesContext = FULL) {
  const byId = new Map(
    hostOptions(draft, context).map((option) => [option.id, option]),
  );
  return (
    id: string,
  ): Pick<OptionStatus, "enabled" | "selected" | "reason"> => {
    const option = byId.get(id);
    if (!option) throw new Error(`no option ${id}`);
    const { enabled, selected, reason } = option;
    return reason === undefined
      ? { enabled, selected }
      : { enabled, selected, reason };
  };
}

function option(draft: HostDraft, id: string) {
  const found = hostOptionList(draft).find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no option ${id}`);
  return found;
}

const ON = { enabled: true, selected: false };
const SELECTED = { enabled: true, selected: true };
const off = (reason: string) => ({ enabled: false, selected: false, reason });

const postgres = {
  [SB_MAIN]: { kind: "in-process", storage: { kind: "postgres" } },
};

describe("hostOptions", () => {
  it("offers every level of access control for the whole host", () => {
    const status = statuses({ envelope: stack() });
    expect(
      [0, 1, 2, 3, 4].map((level) => status(`host:access:${level}`)),
    ).toEqual([SELECTED, ON, ON, ON, ON]);
    const level2 = option({ envelope: stack() }, "host:access:2");
    expect(level2.setters).toEqual([
      {
        path: "members.switchboard.reactor.protocol.featureFlags",
        value: ladderFlags(2),
      },
      {
        path: "members.connect.reactor.protocol.featureFlags",
        value: ladderFlags(2),
      },
    ]);
    expect(level2.label).toBe("Deletion history, Permissions");
  });

  it("disables permissions that would stop background workers", () => {
    const draft = {
      envelope: withSetters(postgres),
      env: { REACTOR_WORKERS: "2" },
    };
    const status = statuses(draft, { ...FULL, renownSource: "self" });
    expect(status("host:access:1")).toEqual(ON);
    expect(status("host:access:2")).toEqual(off(REASONS.workersTrust));
    expect(statuses(draft)("host:access:2")).toEqual(ON);
  });

  it("disables an access level that the host's env contradicts", () => {
    const draft = {
      envelope: stack(),
      env: { REACTOR_AUTH_ENFORCEMENT: "false" },
    };
    expect(statuses(draft)("host:access:2")).toEqual(
      off(
        "REACTOR_AUTH_ENFORCEMENT=false disagrees with the host's setting (true), so sb won't start.",
      ),
    );
  });

  it("judges an option by the problems it adds, not the ones already there", () => {
    const draft = { envelope: stack(), env: { NODE_OPTIONS: "--x" } };
    expect(validateDraft(draft, FULL).issues).toHaveLength(1);
    expect(statuses(draft)("host:access:3")).toEqual(ON);
  });

  it("offers a switchboard folder or Postgres, never memory", () => {
    const status = statuses({ envelope: stack() });
    expect(status(`${SB}:storage:main:path`)).toEqual(SELECTED);
    expect(status(`${SB}:storage:main:memory`)).toEqual(
      off(
        "A switchboard ignores in-memory storage and keeps its data in a folder on disk.",
      ),
    );
    expect(status(`${SB}:storage:main:postgres`)).toEqual(ON);
    expect(
      statuses({ envelope: stack() }, BARE)(`${SB}:storage:main:postgres`),
    ).toEqual(off(REASONS.noPostgres));
  });

  it("keeps a folder's path when switching to it and drops it for Postgres", () => {
    const draft = { envelope: stack() };
    const path = option(draft, `${SB}:storage:main:path`);
    const pg = option(draft, `${SB}:storage:main:postgres`);
    expect(path.setters.map((s) => s.path)).not.toContain(
      `${SB_MAIN}.storage.dataDir`,
    );
    expect(pg.setters).toContainEqual({
      path: `${SB_MAIN}.storage.dataDir`,
      value: { $delete: true },
    });
    expect(pg.setters).toContainEqual({
      path: `${SB_MAIN}.kind`,
      value: "in-process",
    });
  });

  it("disables background workers until they can run", () => {
    expect(statuses({ envelope: stack() })(`host:workers:2`)).toEqual(
      off(REASONS.workersStorage),
    );
    expect(statuses({ envelope: stack() })(`host:workers:0`)).toEqual(SELECTED);
    const pg = { envelope: withSetters(postgres) };
    expect(statuses(pg)(`host:workers:4`)).toEqual(ON);
    expect(statuses(pg, { ...FULL, verb: "dev" })(`host:workers:4`)).toEqual(
      off(REASONS.workersDev),
    );
    expect(statuses({ envelope: stack() })(`host:projectionWorker:on`)).toEqual(
      off(REASONS.projectionStorage),
    );
    expect(statuses(pg)(`host:projectionWorker:on`)).toEqual(ON);
  });

  it("selects workers and the search thread by what the switchboard reads", () => {
    const draft = {
      envelope: withSetters(postgres),
      env: {
        REACTOR_WORKERS: " 2 ",
        REACTOR_PROJECTION_WORKER: "false",
      },
    };
    const status = statuses(draft);
    expect(status(`host:workers:2`)).toEqual(SELECTED);
    expect(status(`host:projectionWorker:off`)).toEqual(SELECTED);
    expect(status(`host:projectionWorker:on`)).toEqual(ON);
  });

  it("offers workers for the whole host, and only with a switchboard", () => {
    const ids = (envelope: HostExport) =>
      hostOptionList({ envelope })
        .filter((candidate) => candidate.group === "workers")
        .map((candidate) => [candidate.id, candidate.member]);
    expect(ids(stack())).toEqual(
      WORKER_COUNTS.map((count) => [`host:workers:${count}`, undefined]),
    );
    expect(ids(hostExport("connect"))).toEqual([]);
  });

  it("disables Postgres storage while workers need it", () => {
    const draft = {
      envelope: withSetters(postgres),
      env: { REACTOR_WORKERS: "2" },
    };
    expect(statuses(draft)(`${SB}:storage:main:path`)).toEqual(
      off(REASONS.workersStorage),
    );
  });

  it("offers hot reload per switchboard, off only when the host allows it", () => {
    const status = statuses({ envelope: stack() });
    expect(status(`${SB}:hotReload:off`)).toEqual(SELECTED);
    expect(status(`${SB}:hotReload:on`)).toEqual(ON);
    expect(option({ envelope: stack() }, `${SB}:hotReload:on`).setters).toEqual(
      [{ path: `${SB}.runner.dev`, value: true }],
    );
    expect(
      option({ envelope: stack() }, `${SB}:hotReload:off`).setters,
    ).toEqual([{ path: `${SB}.runner.dev`, value: false }]);
    const withWorkers = {
      envelope: withSetters(postgres),
      env: { REACTOR_WORKERS: "2" },
    };
    expect(statuses(withWorkers)(`${SB}:hotReload:on`)).toEqual(
      off(HOT_RELOAD_REASONS.workers),
    );
    const vetra = statuses({ envelope: hostExport("vetra") });
    expect(vetra("host.children.vetra-switchboard:hotReload:on")).toEqual(
      SELECTED,
    );
    expect(vetra("host.children.vetra-switchboard:hotReload:off")).toEqual(
      off(HOT_RELOAD_REASONS.hostWide),
    );
    const dev = { envelope: withSetters({ [`${SB}.runner.dev`]: true }) };
    expect(statuses(dev)(`${SB}:hotReload:off`)).toEqual(ON);
    // The folder turns dev on; Off has to override it on the wrapper.
    const folderDev = {
      envelope: withSetters({ "members.switchboard.runner.dev": true }),
    };
    expect(statuses(folderDev)(`${SB}:hotReload:on`)).toEqual(SELECTED);
    const turnedOff = applyOption(
      folderDev,
      option(folderDev, `${SB}:hotReload:off`),
    ).draft;
    expect(statuses(turnedOff)(`${SB}:hotReload:off`)).toEqual(SELECTED);
  });

  it("offers browser storage to in-browser reactors", () => {
    const status = statuses({ envelope: stack() });
    expect(status(`${UI}:storage:main:idb`)).toEqual(ON);
    expect(status(`${UI}:storage:main:memory`)).toEqual(ON);
    expect(status(`${UI}:storage:main:path`)).toEqual(
      off("Only a switchboard can store in a folder."),
    );
    expect(status(`${UI}:storage:main:postgres`)).toEqual(
      off(
        "A browser can't reach Postgres. Sync with a switchboard that uses it instead.",
      ),
    );
    expect(status(`${UI}:backendKind:main:worker`)).toEqual(SELECTED);
    expect(status(`${UI}:backendKind:main:in-process`)).toEqual(ON);
  });

  it("gives every option its own id, even for two children of one folder", () => {
    const envelope = withSetters({
      "host.children.sb2": { host: "switchboard" },
    });
    const ids = hostOptionList({ envelope }).map((candidate) => candidate.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("adding and removing reactors", () => {
  it("adds a switchboard from its folder", () => {
    const connectOnly = {
      envelope: withSetters({
        [SB]: { $delete: true },
        "members.switchboard": { $delete: true },
      }),
    };
    expect(statuses(connectOnly)("host:add:switchboard")).toEqual(
      off(ADD_REASONS.noSwitchboard),
    );
    const withFolder = { envelope: withSetters({ [SB]: { $delete: true } }) };
    expect(statuses(withFolder)("host:add:switchboard")).toEqual(ON);
    const added = applyOption(
      withFolder,
      option(withFolder, "host:add:switchboard"),
    );
    expect(validateDraft(added.draft, FULL).issues).toEqual([]);
    expect(
      (added.draft.envelope.host as { children: Record<string, unknown> })
        .children.switchboard,
    ).toEqual({ host: "switchboard" });
  });

  it("gives a second Connect of one folder its own reactor block", () => {
    const draft = { envelope: stack() };
    const added = applyOption(draft, option(draft, "host:add:connect"));
    expect(validateDraft(added.draft, FULL).issues).toEqual([]);
    expect(
      (added.draft.envelope.host as { children: Record<string, unknown> })
        .children.connect,
    ).toMatchObject({
      host: "connect",
      reactor: { backends: { main: { kind: "worker" } } },
    });
  });

  it("adds Connect and a browser reactor", () => {
    const draft = { envelope: stack() };
    for (const id of ["host:add:connect", "host:add:browser"]) {
      expect(statuses(draft)(id)).toEqual(ON);
      const added = applyOption(draft, option(draft, id));
      expect(validateDraft(added.draft, FULL).issues, id).toEqual([]);
    }
    const single = { envelope: hostExport("switchboard") };
    const browser = applyOption(single, option(single, "host:add:browser"));
    expect(validateDraft(browser.draft, FULL).issues).toEqual([]);
    expect(browser.draft.envelope.host).toMatchObject({
      reactor: {
        backends: { main: { kind: "in-process" }, tab: { kind: "in-process" } },
      },
    });
  });

  it("says when a reactor can't be added", () => {
    expect(
      statuses(
        { envelope: stack() },
        { postgres: true, controller: false },
      )("host:add:switchboard"),
    ).toEqual(off(REASONS.noController));
    const single = statuses({ envelope: hostExport("switchboard") });
    expect(single("host:add:switchboard")).toEqual(off(ADD_REASONS.single));
    expect(single("host:add:connect")).toEqual(off(ADD_REASONS.single));
    expect(single("host:add:browser")).toEqual(ON);
    const empty = withSetters({
      [SB]: { $delete: true },
      [UI]: { $delete: true },
    });
    expect(statuses({ envelope: empty })("host:add:browser")).toEqual(
      off(ADD_REASONS.owner),
    );
    const noConnect = withSetters({
      [UI]: { $delete: true },
      "members.connect": { $delete: true },
    });
    expect(statuses({ envelope: noConnect })("host:add:connect")).toEqual(
      off(ADD_REASONS.noConnect),
    );
  });

  it("removes a reactor and the folder no one runs any more", () => {
    const envelope = withSetters({
      [UI]: { $delete: true },
      "members.connect": { $delete: true },
    });
    expect(validateDraft({ envelope }, FULL).issues).toEqual([]);
    for (const path of [UI, "members.connect"]) {
      expect(checkSetter({ path, value: { $delete: true } }, stack())).toEqual({
        ok: true,
      });
    }
  });
});

describe("option setters", () => {
  it("write only what the monitor may write", () => {
    for (const name of [
      "switchboard",
      "connect",
      "cli",
      "desktop",
      "vetra",
    ] as const) {
      const envelope = hostExport(name);
      for (const candidate of hostOptionList({ envelope })) {
        for (const setter of candidate.setters) {
          expect(
            checkSetter(setter, envelope),
            `${candidate.id} ${setter.path}`,
          ).toEqual({ ok: true });
        }
      }
    }
  });

  it("apply setters and env, and the result validates clean", () => {
    const draft = { envelope: withSetters(postgres) };
    let next = applyOption(draft, option(draft, "host:access:3")).draft;
    next = applyOption(next, option(next, `host:workers:2`)).draft;
    expect(next.env).toEqual({ REACTOR_WORKERS: "2" });
    expect(validateDraft(next, FULL).issues).toEqual([]);
    next = applyOption(next, option(next, `host:workers:0`)).draft;
    expect(next.env).toEqual({});
  });

  it("refuse an option the policy forbids", () => {
    const result = applyOption(
      { envelope: stack() },
      {
        id: "x",
        group: "access",
        value: "x",
        label: "x",
        setters: [{ path: "host.runner.module", value: "x" }],
      },
    );
    expect(result.refused).toContain("which runner");
  });
});
