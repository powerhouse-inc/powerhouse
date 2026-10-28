import {
  reactorSchema,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { describe, expect, it } from "vitest";
import { FULL, hostExport, stack } from "./__fixtures__/hosts.js";
import { membersOf } from "./members.js";
import {
  ADD_REASONS,
  applyOption,
  hostOptionList,
  hostOptions,
  type OptionStatus,
} from "./options.js";
import { checkSetter } from "./policy.js";
import { connectReach, REACH_REASONS } from "./reach.js";
import type { HostDraft } from "./schema.js";
import { applySetters } from "./setters.js";
import { validateDraft } from "./validate.js";

const UI = "host.children.ui";
const SB = "host.children.sb";

function status(draft: HostDraft, id: string) {
  const found = hostOptions(draft, FULL).find((option) => option.id === id);
  if (!found) throw new Error(`no option ${id}`);
  const { enabled, selected, reason } = found;
  return reason === undefined
    ? { enabled, selected }
    : { enabled, selected, reason };
}

/** Chooses an option as the builder does: it must be enabled. */
function choose(draft: HostDraft, id: string): HostDraft {
  const found = hostOptions(draft, FULL).find((option) => option.id === id);
  if (!found) throw new Error(`no option ${id}`);
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

function reachOf(draft: HostDraft, path = UI) {
  const members = membersOf(draft);
  const member = members.find((candidate) => candidate.path === path)!;
  return connectReach(member, members);
}

function issues(draft: HostDraft) {
  return validateDraft(draft, FULL).issues.map((issue) => [
    issue.path,
    issue.message,
  ]);
}

function withSetters(
  base: HostExport,
  setters: Record<string, unknown>,
): HostDraft {
  const applied = applySetters(
    base,
    Object.entries(setters).map(([path, value]) => ({
      path,
      value: value as never,
    })),
  );
  expect(applied.issues).toEqual([]);
  return { envelope: applied.envelope };
}

const off = (reason: string) => ({ enabled: false, selected: false, reason });
const ON = { enabled: true, selected: false };

const drive = (slug: string, member = "sb", host = "switchboard") => ({
  $output: { host, member, path: ["drives", slug, "url"] },
});

describe("linking a Connect to a switchboard's drives", () => {
  it("refuses the drive Connect already has, and adds one to link", () => {
    const draft = { envelope: stack() };
    expect(status(draft, `${UI}:reach:open:sb:powerhouse`)).toEqual(
      off(REACH_REASONS.clash("powerhouse")),
    );
    expect(status(draft, `${SB}:reach:addDrive`)).toEqual(ON);
    const added = choose(draft, `${SB}:reach:addDrive`);
    expect(
      (added.envelope.members.switchboard as { reactor: { drives: unknown } })
        .reactor.drives,
    ).toEqual([
      { slug: "powerhouse", name: "my-project" },
      { slug: "shared", name: "Shared" },
    ]);
    expect(issues(added)).toEqual([]);

    const linked = choose(added, `${UI}:reach:open:sb:shared`);
    expect(issues(linked)).toEqual([]);
    const ui = (linked.envelope.host as { children: Record<string, unknown> })
      .children.ui as { reactor: Record<string, unknown> };
    expect(ui.reactor).toMatchObject({
      backends: {
        main: { kind: "worker" },
        sb: { kind: "remote", remote: { url: drive("shared") } },
      },
      drives: [{ slug: "powerhouse", name: "my-project" }],
      placement: { drives: { shared: "sb" } },
    });
    const reach = reachOf(linked);
    expect(reach.member.reactorAt).toBe(`${UI}.reactor`);
    expect(
      reach.links.map(({ slug, switchboard, remoteOnly }) => ({
        slug,
        switchboard,
        remoteOnly,
      })),
    ).toEqual([{ slug: "shared", switchboard: "sb", remoteOnly: true }]);
    expect(status(linked, `${UI}:placement:shared:remote`)).toEqual({
      enabled: true,
      selected: true,
    });
    const copied = choose(linked, `${UI}:placement:shared:copy`);
    expect(reachOf(copied).links[0].remoteOnly).toBe(false);
    expect(issues(copied)).toEqual([]);
  });

  it("lists a second drive on the same switchboard under reactor.drives", () => {
    let draft: HostDraft = { envelope: stack() };
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, `${UI}:reach:open:sb:shared`);
    draft = choose(draft, `${UI}:reach:open:sb:shared-2`);
    expect(issues(draft)).toEqual([]);
    const reactor = reachOf(draft).member.reactor!;
    expect(Object.keys(reactor.backends as object)).toEqual(["main", "sb"]);
    expect(reactor.drives).toEqual([
      { slug: "powerhouse", name: "my-project" },
      { slug: "shared-2", remote: { url: drive("shared-2") } },
    ]);
    expect(reactor.placement).toEqual({
      drives: { shared: "sb", "shared-2": "sb" },
    });

    // Removing the backend's own drive moves the link to the other one.
    const unlinked = choose(draft, `${UI}:reach:unlink:shared`);
    expect(issues(unlinked)).toEqual([]);
    const after = reachOf(unlinked).member.reactor!;
    expect(after.backends).toMatchObject({
      sb: { remote: { url: drive("shared-2") } },
    });
    expect(after.drives).toEqual([{ slug: "powerhouse", name: "my-project" }]);
    expect(after.placement).toEqual({ drives: { "shared-2": "sb" } });

    const listed = choose(draft, `${UI}:reach:unlink:shared-2`);
    expect(reachOf(listed).links.map((link) => link.slug)).toEqual(["shared"]);
    expect(issues(listed)).toEqual([]);
  });

  it("starts a drive list for a Connect that declares none", () => {
    let draft = withSetters(stack(), {
      "members.connect.reactor": { backends: { main: { kind: "worker" } } },
    });
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, `${UI}:reach:open:sb:powerhouse`);
    draft = choose(draft, `${UI}:reach:open:sb:shared`);
    expect(issues(draft)).toEqual([]);
    expect(reachOf(draft).member.reactor?.drives).toEqual([
      { slug: "shared", remote: { url: drive("shared") } },
    ]);
  });

  it("writes a reactor block host-core accepts once addresses are known", () => {
    let draft: HostDraft = { envelope: stack() };
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, `${UI}:reach:open:sb:shared`);
    draft = choose(draft, `${UI}:reach:open:sb:shared-2`);
    const resolved = JSON.parse(
      JSON.stringify(reachOf(draft).member.reactor),
      (_key, value: unknown) => {
        const ref = (value as { $output?: { path: string[] } } | null)?.$output;
        return ref ? `http://127.0.0.1:4001/d/${ref.path[1]}` : value;
      },
    ) as unknown;
    expect(reactorSchema.safeParse(resolved).error?.issues).toBeUndefined();
  });

  it("keeps drives only on the switchboard once the browser reactor goes", () => {
    let draft: HostDraft = { envelope: stack() };
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, `${UI}:reach:open:sb:shared`);
    draft = choose(draft, `${UI}:reach:remove:main`);
    expect(issues(draft)).toEqual([]);
    const reach = reachOf(draft);
    expect(reach.notes).toEqual([REACH_REASONS.remoteOnly]);
    expect(status(draft, `${UI}:placement:shared:copy`)).toEqual(
      off(REACH_REASONS.remoteOnly),
    );
    expect(status(draft, `${UI}:placement:shared:remote`)).toEqual({
      enabled: true,
      selected: true,
    });
    expect(status(draft, `${UI}:reach:unlink:shared`)).toEqual(
      off(REACH_REASONS.lastOne),
    );
    const local = choose(draft, `${UI}:reach:local`);
    expect(reachOf(local).local.map((backend) => backend.body)).toEqual([
      { kind: "worker", storage: { kind: "idb" } },
    ]);
  });

  it("says why there is nothing to link to", () => {
    const single = { envelope: hostExport("connect") };
    expect(status(single, "host:reach:open")).toEqual(
      off(REACH_REASONS.compound),
    );
    const alone = withSetters(stack(), { [SB]: { $delete: true } });
    expect(status(alone, `${UI}:reach:open`)).toEqual(
      off(REACH_REASONS.noSwitchboard),
    );
  });

  it("links one switchboard today", () => {
    let draft: HostDraft = { envelope: stack() };
    draft = choose(draft, "host:add:switchboard");
    draft = choose(draft, `${SB}:reach:addDrive`);
    draft = choose(draft, "host.children.switchboard:reach:addDrive");
    draft = choose(draft, `${UI}:reach:open:sb:shared`);
    expect(status(draft, `${UI}:reach:open:switchboard:shared-2`)).toEqual(
      off(REACH_REASONS.oneSwitchboard),
    );
  });

  it("works with the cli host's switchboard-only Connect", () => {
    const draft = { envelope: hostExport("cli") };
    const connect = "host.children.cli-connect";
    const reach = reachOf(draft, connect);
    expect(reach.links.map((link) => [link.slug, link.switchboard])).toEqual([
      ["powerhouse", "cli-switchboard"],
    ]);
    expect(reach.notes).toEqual([
      REACH_REASONS.remoteOnly,
      REACH_REASONS.mapped,
    ]);
    expect(status(draft, `${connect}:reach:local`)).toEqual(ON);
    const ids = hostOptionList(draft).map((option) => option.id);
    expect(ids).not.toContain(
      `${connect}:reach:open:cli-switchboard:powerhouse`,
    );
    const added = choose(draft, "host.children.cli-switchboard:reach:addDrive");
    expect(
      status(added, `${connect}:reach:open:cli-switchboard:shared`),
    ).toEqual(off(REACH_REASONS.mapped));
  });
});

describe("reach rules", () => {
  const ui = (reactor: Record<string, unknown>) =>
    withSetters(stack(), { [`${UI}.reactor`]: reactor });

  it("asks for a drive, not the switchboard's GraphQL endpoint", () => {
    const draft = ui({
      backends: {
        sb: {
          kind: "remote",
          remote: {
            url: {
              $output: {
                host: "switchboard",
                member: "sb",
                path: ["endpoints", "graphql"],
              },
            },
          },
        },
      },
    });
    expect(issues(draft)).toContainEqual([
      `${UI}.reactor.backends.sb.remote.url`,
      REACH_REASONS.notDrive,
    ]);
  });

  it("refuses two links to one switchboard, and two browser reactors", () => {
    const draft = ui({
      backends: {
        main: { kind: "worker" },
        tab: { kind: "in-process" },
        a: { kind: "remote", remote: { url: drive("a") } },
        b: { kind: "remote", remote: { url: drive("b") } },
      },
    });
    expect(issues(draft)).toEqual(
      expect.arrayContaining([
        [`${UI}.reactor.backends.tab`, REACH_REASONS.oneLocal],
        [`${UI}.reactor.backends.b.remote.url`, REACH_REASONS.sameSwitchboard],
      ]),
    );
  });

  it("refuses a Connect with nowhere to keep drives", () => {
    expect(issues(ui({ backends: {} }))).toContainEqual([
      `${UI}.reactor.backends`,
      REACH_REASONS.lastOne,
    ]);
    expect(issues(ui({}))).toEqual([]);
  });

  it("refuses a link to a drive Connect keeps itself", () => {
    const draft = ui({
      backends: {
        main: { kind: "worker" },
        sb: { kind: "remote", remote: { url: drive("powerhouse") } },
      },
      drives: [{ slug: "powerhouse" }],
    });
    expect(issues(draft)).toContainEqual([
      `${UI}.reactor.backends.sb.remote.url`,
      REACH_REASONS.clash("powerhouse"),
    ]);
  });
});

describe("a browser reactor beside Connect", () => {
  const byId = (draft: HostDraft): Map<string, OptionStatus> =>
    new Map(hostOptions(draft, FULL).map((option) => [option.id, option]));

  it("goes beside the switchboard when Connect has one", () => {
    const draft = { envelope: stack() };
    const option = byId(draft).get("host:add:browser")!;
    expect(option.setters.map((setter) => setter.path)).toEqual([
      "members.switchboard.reactor.backends.main",
      "members.switchboard.reactor.backends.tab",
    ]);
  });

  it("is refused when only a Connect with one could hold it", () => {
    const alone = withSetters(stack(), { [SB]: { $delete: true } });
    expect(status(alone, "host:add:browser")).toEqual(
      off(REACH_REASONS.oneLocal),
    );
    expect(ADD_REASONS.owner).not.toBe(REACH_REASONS.oneLocal);
  });
});
