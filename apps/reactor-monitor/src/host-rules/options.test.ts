import type { HostExport } from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { BARE, FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import { ladderFlags } from "./flags.js";
import {
  applyOption,
  hostOptionList,
  hostOptions,
  NEEDS_OWNER,
  SINGLE_HOST,
  type OptionStatus,
} from "./options.js";
import { checkSetter } from "./policy.js";
import type { HostDraft, HostRulesContext } from "./schema.js";
import { applySetters } from "./setters.js";
import { REASONS, validateDraft } from "./validate.js";

const SB = "host.children.sb";
const SB_MAIN = "members.switchboard.reactor.backends.main";
const UI_MAIN = "members.connect.reactor.backends.main";

function withSetters(
  setters: Record<string, unknown>,
  base = stack(),
): HostExport {
  return applySetters(
    base,
    Object.entries(setters).map(([path, value]) => ({
      path,
      value: value as never,
    })),
  ).envelope;
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

const ON = { enabled: true, selected: false };
const SELECTED = { enabled: true, selected: true };
const off = (reason: string) => ({ enabled: false, selected: false, reason });

const postgres = {
  [SB_MAIN]: { kind: "in-process", storage: { kind: "postgres" } },
};

describe("hostOptions", () => {
  it("offers every level of access control for the whole host", () => {
    const status = statuses({ envelope: stack() });
    expect([0, 1, 2, 3, 4].map((level) => status(`access:${level}`))).toEqual([
      SELECTED,
      ON,
      ON,
      ON,
      ON,
    ]);
    const level2 = hostOptionList({ envelope: stack() }).find(
      (o) => o.id === "access:2",
    );
    expect(level2?.setters).toEqual([
      {
        path: "members.switchboard.reactor.protocol.featureFlags",
        value: ladderFlags(2),
      },
      {
        path: "members.connect.reactor.protocol.featureFlags",
        value: ladderFlags(2),
      },
    ]);
    expect(level2?.label).toBe("Deletion history, Permissions");
  });

  it("disables permissions that would stop background workers", () => {
    const draft = {
      envelope: withSetters(postgres),
      env: { [SB]: { REACTOR_WORKERS: "2" } },
    };
    const status = statuses(draft, { ...FULL, renownSource: "self" });
    expect(status("access:1")).toEqual(ON);
    expect(status("access:2")).toEqual(off(REASONS.workersTrust));
    expect(statuses(draft)("access:2")).toEqual(ON);
  });

  it("disables an access level that a member's env contradicts", () => {
    const draft = {
      envelope: stack(),
      env: { [SB]: { REACTOR_AUTH_ENFORCEMENT: "false" } },
    };
    expect(statuses(draft)("access:2")).toEqual(
      off(
        "REACTOR_AUTH_ENFORCEMENT=false disagrees with the host's setting (true), so sb won't start.",
      ),
    );
  });

  it("offers a switchboard folder or Postgres, never memory", () => {
    const status = statuses({ envelope: stack() });
    expect(status(`${SB_MAIN}:storage:path`)).toEqual(SELECTED);
    expect(status(`${SB_MAIN}:storage:memory`)).toEqual(
      off(
        "A switchboard ignores in-memory storage and keeps its data in a folder on disk.",
      ),
    );
    expect(status(`${SB_MAIN}:storage:postgres`)).toEqual(ON);
    expect(
      statuses({ envelope: stack() }, BARE)(`${SB_MAIN}:storage:postgres`),
    ).toEqual(off(REASONS.noPostgres));
  });

  it("keeps a folder's path when switching to it and drops it for Postgres", () => {
    const options = hostOptionList({ envelope: stack() });
    const path = options.find((o) => o.id === `${SB_MAIN}:storage:path`);
    const pg = options.find((o) => o.id === `${SB_MAIN}:storage:postgres`);
    expect(path?.setters.map((s) => s.path)).not.toContain(
      `${SB_MAIN}.storage.dataDir`,
    );
    expect(pg?.setters).toContainEqual({
      path: `${SB_MAIN}.storage.dataDir`,
      value: { $delete: true },
    });
    expect(pg?.setters).toContainEqual({
      path: `${SB_MAIN}.kind`,
      value: "in-process",
    });
  });

  it("disables background workers until they can run", () => {
    expect(statuses({ envelope: stack() })(`${SB}:workers:2`)).toEqual(
      off(REASONS.workersStorage),
    );
    expect(statuses({ envelope: stack() })(`${SB}:workers:0`)).toEqual(
      SELECTED,
    );
    const pg = { envelope: withSetters(postgres) };
    expect(statuses(pg)(`${SB}:workers:4`)).toEqual(ON);
    expect(statuses(pg, { ...FULL, verb: "dev" })(`${SB}:workers:4`)).toEqual(
      off(REASONS.workersDev),
    );
    expect(
      statuses({ envelope: stack() })(`${SB}:projectionWorker:on`),
    ).toEqual(off(REASONS.projectionStorage));
    expect(statuses(pg)(`${SB}:projectionWorker:on`)).toEqual(ON);
  });

  it("disables Postgres storage while workers need it", () => {
    const draft = {
      envelope: withSetters(postgres),
      env: { [SB]: { REACTOR_WORKERS: "2" } },
    };
    expect(statuses(draft)(`${SB_MAIN}:storage:path`)).toEqual(
      off(REASONS.workersStorage),
    );
  });

  it("offers browser storage to in-browser reactors", () => {
    const status = statuses({ envelope: stack() });
    expect(status(`${UI_MAIN}:storage:idb`)).toEqual(ON);
    expect(status(`${UI_MAIN}:storage:memory`)).toEqual(ON);
    expect(status(`${UI_MAIN}:storage:path`)).toEqual(
      off("Only a switchboard can store in a folder."),
    );
    expect(status(`${UI_MAIN}:storage:postgres`)).toEqual(
      off(
        "A browser can't reach Postgres. Sync with a switchboard that uses it instead.",
      ),
    );
    expect(status(`${UI_MAIN}:backendKind:worker`)).toEqual(SELECTED);
    expect(status(`${UI_MAIN}:backendKind:in-process`)).toEqual(ON);
  });

  it("says when a reactor can't be added", () => {
    expect(
      ["switchboard", "connect", "browser"].map((v) =>
        statuses({ envelope: stack() })(`add:${v}`),
      ),
    ).toEqual([ON, ON, ON]);
    expect(
      statuses(
        { envelope: stack() },
        { postgres: true, controller: false },
      )("add:switchboard"),
    ).toEqual(off(REASONS.noController));
    const single = statuses({ envelope: hostExport("switchboard") });
    expect(single("add:switchboard")).toEqual(off(SINGLE_HOST));
    expect(single("add:connect")).toEqual(off(SINGLE_HOST));
    expect(single("add:browser")).toEqual(ON);
    const empty = withSetters({
      "host.children.sb": { $delete: true },
      "host.children.ui": { $delete: true },
    });
    expect(statuses({ envelope: empty })("add:browser")).toEqual(
      off(NEEDS_OWNER),
    );
  });

  it("writes only what the monitor may write", () => {
    for (const name of [
      "switchboard",
      "connect",
      "cli",
      "desktop",
      "vetra",
    ] as const) {
      const envelope = hostExport(name);
      for (const option of hostOptionList({ envelope })) {
        for (const setter of option.setters) {
          expect(
            checkSetter(setter, envelope),
            `${option.id} ${setter.path}`,
          ).toEqual({ ok: true });
        }
      }
    }
  });
});

describe("applyOption", () => {
  it("writes setters and env, and the result validates clean", () => {
    const draft = { envelope: withSetters(postgres) };
    const options = hostOptionList(draft);
    const pick = (id: string) => options.find((option) => option.id === id)!;
    let next = applyOption(draft, pick("access:3")).draft;
    next = applyOption(next, pick(`${SB}:workers:2`)).draft;
    expect(next.env).toEqual({ [SB]: { REACTOR_WORKERS: "2" } });
    expect(validateDraft(next, FULL).issues).toEqual([]);
    next = applyOption(next, pick(`${SB}:workers:0`)).draft;
    expect(next.env).toEqual({ [SB]: {} });
  });

  it("refuses an option the policy forbids", () => {
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
