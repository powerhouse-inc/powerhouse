import {
  CONNECT_PRIMARY_MESSAGE,
  reactorSchema,
} from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { FULL, stack } from "./__fixtures__/hosts.js";
import { membersOf } from "./members.js";
import {
  addDriveStatus,
  applyOption,
  hostOptions,
  type OptionStatus,
} from "./options.js";
import { checkSetter } from "./policy.js";
import {
  ROUTER_REASONS,
  routerSettingLines,
  routerSettings,
} from "./router-settings.js";
import { isDelete, type HostDraft } from "./schema.js";
import { applySetters } from "./setters.js";
import { validateDraft } from "./validate.js";

const UI = "host.children.ui";
const SB = "host.children.sb";

function find(draft: HostDraft, id: string): OptionStatus {
  const found = hostOptions(draft, FULL).find((option) => option.id === id);
  if (!found) throw new Error(`no option ${id}`);
  return found;
}

function status(draft: HostDraft, id: string) {
  const { enabled, selected, reason, label } = find(draft, id);
  return reason === undefined
    ? { enabled, selected, label }
    : { enabled, selected, label, reason };
}

function choose(draft: HostDraft, id: string): HostDraft {
  const found = find(draft, id);
  expect(found.reason, id).toBeUndefined();
  for (const setter of found.setters) {
    expect(checkSetter(setter, draft.envelope), setter.path).toEqual({
      ok: true,
    });
  }
  const applied = applyOption(draft, found);
  expect(applied.refused).toBeUndefined();
  return applied.draft;
}

function addDrive(draft: HostDraft, switchboard: string, name: string) {
  const found = addDriveStatus(draft, FULL, switchboard, name)!;
  expect(found.reason, name).toBeUndefined();
  return applyOption(draft, found).draft;
}

function ui(draft: HostDraft) {
  const members = membersOf(draft);
  return {
    member: members.find((candidate) => candidate.path === UI)!,
    members,
  };
}

function reactorOf(draft: HostDraft): Record<string, unknown> {
  return ui(draft).member.reactor!;
}

function issues(draft: HostDraft) {
  return validateDraft(draft, FULL).issues.map(({ path, message, hint }) =>
    hint === undefined ? [path, message] : [path, message, hint],
  );
}

function set(draft: HostDraft, setters: Record<string, unknown>): HostDraft {
  const applied = applySetters(
    draft.envelope,
    Object.entries(setters).map(([path, value]) => ({
      path,
      value: value as never,
    })),
  );
  expect(applied.issues).toEqual([]);
  return { envelope: applied.envelope };
}

/** The stack's Connect opens "shared" on sb and keeps its browser reactor. */
function linked(): HostDraft {
  let draft: HostDraft = { envelope: stack() };
  draft = addDrive(draft, SB, "Shared");
  return choose(draft, `${UI}:reach:open:sb:shared`);
}

const ids = (draft: HostDraft, group: string) =>
  hostOptions(draft, FULL)
    .filter((option) => option.member === UI && option.group === group)
    .map((option) => option.id);

describe("where new drives go", () => {
  it("is offered only once the Connect links a switchboard", () => {
    expect(ids({ envelope: stack() }, "newDrives")).toEqual([]);
    expect(ids({ envelope: stack() }, "probeTimeout")).toEqual([]);
    expect(ids(linked(), "newDrives")).toEqual([
      `${UI}:newDrives:browser`,
      `${UI}:newDrives:sb`,
    ]);
  });

  it("writes placement.newDrives, and In this browser removes it", () => {
    const draft = linked();
    expect(status(draft, `${UI}:newDrives:browser`)).toEqual({
      enabled: true,
      selected: true,
      label: "In this browser",
    });
    expect(status(draft, `${UI}:newDrives:sb`)).toEqual({
      enabled: true,
      selected: false,
      label: "On sb",
    });
    const onSb = choose(draft, `${UI}:newDrives:sb`);
    expect(reactorOf(onSb).placement).toEqual({
      drives: { shared: "sb" },
      newDrives: "sb",
    });
    expect(issues(onSb)).toEqual([]);
    expect(find(onSb, `${UI}:newDrives:sb`).selected).toBe(true);
    expect(find(onSb, `${UI}:newDrives:browser`).selected).toBe(false);
    expect(routerSettings(ui(onSb).member, ui(onSb).members).newDrives).toBe(
      "sb",
    );

    const back = choose(onSb, `${UI}:newDrives:browser`);
    expect(reactorOf(back).placement).toEqual({ drives: { shared: "sb" } });
    expect(find(back, `${UI}:newDrives:browser`).selected).toBe(true);
  });

  it("can't choose this browser for a Connect with no browser reactor", () => {
    const draft = choose(linked(), `${UI}:reach:remove:main`);
    expect(status(draft, `${UI}:newDrives:browser`)).toEqual({
      enabled: false,
      selected: false,
      label: "In this browser",
      reason: ROUTER_REASONS.noBrowser,
    });
    // The only switchboard is where new drives go when nothing says otherwise.
    expect(find(draft, `${UI}:newDrives:sb`).selected).toBe(true);
  });

  it("asks where new drives go when a Connect with no browser reactor links two switchboards", () => {
    let draft = linked();
    draft = choose(draft, "host:add:switchboard");
    draft = addDrive(draft, "host.children.switchboard", "Shared 2");
    draft = choose(draft, `${UI}:reach:open:switchboard:shared-2`);
    const at = `${UI}.reactor`;
    // Removing the browser reactor would leave nowhere for new drives.
    expect(find(draft, `${UI}:reach:remove:main`).reason).toBe(
      ROUTER_REASONS.newDrives,
    );
    const remoteOnly = set(draft, {
      [`${at}.backends.main`]: { $delete: true },
    });
    expect(issues(remoteOnly)).toContainEqual([
      `${at}.placement.newDrives`,
      ROUTER_REASONS.newDrives,
      expect.stringContaining("Set placement.newDrives"),
    ]);
    expect(
      hostOptions(remoteOnly, FULL)
        .filter((option) => option.group === "newDrives")
        .map(({ id, selected, enabled }) => [id, selected, enabled]),
    ).toEqual([
      [`${UI}:newDrives:browser`, false, false],
      [`${UI}:newDrives:sb`, false, true],
      [`${UI}:newDrives:switchboard`, false, true],
    ]);
    const chosen = choose(remoteOnly, `${UI}:newDrives:switchboard`);
    expect(issues(chosen)).toEqual([]);
  });

  it("forgets newDrives with the switchboard it names", () => {
    const draft = choose(linked(), `${UI}:newDrives:sb`);
    const unlinked = choose(draft, `${UI}:reach:unlink:shared`);
    expect(reactorOf(unlinked).placement).toEqual({ drives: {} });
    expect(issues(unlinked)).toEqual([]);
  });

  it("refuses placement.primary on a Connect and never offers it", () => {
    const draft = set(linked(), { [`${UI}.reactor.placement.primary`]: "sb" });
    expect(issues(draft)).toEqual([
      [
        `${UI}.reactor.placement.primary`,
        ROUTER_REASONS.primary,
        CONNECT_PRIMARY_MESSAGE,
      ],
    ]);
    for (const option of hostOptions(draft, FULL)) {
      for (const setter of option.setters) {
        if (!setter.path.endsWith("placement.primary")) continue;
        expect(isDelete(setter.value), option.id).toBe(true);
      }
    }
    // Choosing where new drives go clears it.
    const fixed = choose(draft, `${UI}:newDrives:sb`);
    expect(issues(fixed)).toEqual([]);
    expect(reactorOf(fixed).placement).toEqual({
      drives: { shared: "sb" },
      newDrives: "sb",
    });
  });
});

describe("connection and router presets", () => {
  const remote = (draft: HostDraft) =>
    (reactorOf(draft).backends as Record<string, Record<string, unknown>>).sb
      .remote as Record<string, unknown>;

  it("round-trips every preset, and the default removes the key", () => {
    let draft = linked();
    const defaults: [string, string][] = [
      [`${UI}:requestTimeout:sb:30000`, "Wait up to 30 s (default)"],
      [
        `${UI}:breaker:sb:3/30000`,
        "Stop trying after 3 failures, try again in 30 s (default)",
      ],
      [`${UI}:realtime:sb:on`, "Live updates on (default)"],
      [`${UI}:probeTimeout:3000`, "Wait up to 3 s (default)"],
      [`${UI}:provisionalRoute:30000`, "Look again after 30 s (default)"],
    ];
    for (const [id, label] of defaults) {
      expect(status(draft, id)).toEqual({
        enabled: true,
        selected: true,
        label,
      });
    }

    draft = choose(draft, `${UI}:requestTimeout:sb:120000`);
    draft = choose(draft, `${UI}:breaker:sb:3/120000`);
    draft = choose(draft, `${UI}:realtime:sb:off`);
    draft = choose(draft, `${UI}:probeTimeout:10000`);
    draft = choose(draft, `${UI}:provisionalRoute:300000`);
    expect(remote(draft)).toMatchObject({
      requestTimeoutMs: 120_000,
      breaker: { failures: 3, openMs: 120_000 },
      realtime: false,
    });
    expect(reactorOf(draft).router).toEqual({
      probeTimeoutMs: 10_000,
      provisionalRouteMs: 300_000,
    });
    expect(issues(draft)).toEqual([]);
    for (const id of [
      `${UI}:requestTimeout:sb:120000`,
      `${UI}:breaker:sb:3/120000`,
      `${UI}:realtime:sb:off`,
      `${UI}:probeTimeout:10000`,
      `${UI}:provisionalRoute:300000`,
    ]) {
      expect(find(draft, id).selected, id).toBe(true);
    }
    expect(find(draft, `${UI}:breaker:sb:never`).label).toBe(
      "Never stop trying",
    );
    const never = choose(draft, `${UI}:breaker:sb:never`);
    expect(remote(never).breaker).toBe(false);
    expect(find(never, `${UI}:breaker:sb:never`).selected).toBe(true);

    // host-core accepts the block once the switchboard's address is known.
    const resolved = JSON.parse(
      JSON.stringify(reactorOf(never)),
      (_key, value: unknown) => {
        const ref = (value as { $output?: { path: string[] } } | null)?.$output;
        return ref ? `http://127.0.0.1:4001/d/${ref.path[1]}` : value;
      },
    ) as unknown;
    expect(reactorSchema.safeParse(resolved).error?.issues).toBeUndefined();

    let reset = never;
    for (const [id] of defaults) reset = choose(reset, id);
    expect(Object.keys(remote(reset))).toEqual(["url"]);
    expect(reactorOf(reset).router).toEqual({});
    for (const [id] of defaults) expect(find(reset, id).selected).toBe(true);
  });

  it("shows a value set by hand in host.js read-only", () => {
    const draft = set(linked(), {
      [`${UI}.reactor.backends.sb.remote.requestTimeoutMs`]: 45_000,
      [`${UI}.reactor.backends.sb.remote.breaker`]: { failures: 5 },
      [`${UI}.reactor.router.probeTimeoutMs`]: 0,
      [`${UI}.reactor.router.provisionalRouteMs`]: 30_000,
    });
    expect(status(draft, `${UI}:requestTimeout:sb:custom`)).toEqual({
      enabled: true,
      selected: true,
      label: "Set to 45 s in host.js",
    });
    expect(find(draft, `${UI}:requestTimeout:sb:custom`).setters).toEqual([]);
    expect(find(draft, `${UI}:requestTimeout:sb:30000`).selected).toBe(false);
    expect(status(draft, `${UI}:breaker:sb:custom`)).toEqual({
      enabled: true,
      selected: true,
      label: "Set in host.js: stop trying after 5 failures, try again in 30 s",
    });
    expect(status(draft, `${UI}:probeTimeout:custom`)).toEqual({
      enabled: true,
      selected: true,
      label: "Set to no limit in host.js",
    });
    // A hand-set value equal to a preset is that preset.
    expect(ids(draft, "provisionalRoute")).toEqual([
      `${UI}:provisionalRoute:30000`,
      `${UI}:provisionalRoute:300000`,
    ]);
    expect(find(draft, `${UI}:provisionalRoute:30000`).selected).toBe(true);
    // Another preset still replaces it.
    const replaced = choose(draft, `${UI}:requestTimeout:sb:10000`);
    expect(remote(replaced).requestTimeoutMs).toBe(10_000);
    expect(ids(replaced, "requestTimeout")).not.toContain(
      `${UI}:requestTimeout:sb:custom`,
    );
  });

  it("describes the settings in effect", () => {
    const draft = set(choose(linked(), `${UI}:newDrives:sb`), {
      [`${UI}.reactor.backends.sb.remote.breaker`]: false,
      [`${UI}.reactor.router.probeTimeoutMs`]: 1_000,
    });
    const { member, members } = ui(draft);
    expect(routerSettingLines(routerSettings(member, members))).toEqual([
      "New drives: on sb",
      "Finding a document: wait up to 1 s for each reactor",
      "A document found on a switchboard: look again after 30 s",
      "Connection to sb: wait up to 30 s, never stop trying, live updates on",
    ]);
  });
});
