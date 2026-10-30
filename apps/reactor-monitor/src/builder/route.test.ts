import { describe, expect, it } from "vitest";
import { FULL, stack } from "../host-rules/__fixtures__/hosts.js";
import {
  addDriveStatus,
  applyOption,
  applySetters,
  hostOptions,
  membersOf,
  REACH_REASONS,
  type HostDraft,
  type Member,
} from "../host-rules/index.js";
import type { RouteSeed } from "../lib/route-seed.js";
import { PROJECT } from "./__fixtures__/fakes.js";
import { linkedStack, runOf } from "./__fixtures__/route.js";
import { DIGEST } from "./__fixtures__/steps.js";
import { ROUTE_COPY, SAVE_PLACEMENT } from "./copy.js";
import {
  addEdit,
  envelopeOf,
  loadDraft,
  newDraft,
  saveDraft,
  type DraftStorage,
} from "./draft.js";
import { routeSeedOf, startedMembers } from "./route.js";
import { savePlacement } from "./save-placement.js";

const UI = "host.children.ui";

function seedOf(draft: HostDraft, run = runOf()): RouteSeed | undefined {
  const members = membersOf(draft);
  return routeSeedOf({
    id: "seed",
    member: members.find((member) => member.path === UI)!,
    members,
    run,
    context: FULL,
  });
}

describe("routeSeedOf", () => {
  it("routes the Connect's browser reactor and its switchboard by host config", () => {
    expect(seedOf(linkedStack().draft)).toEqual({
      id: "seed",
      app: "ui",
      member: UI,
      instanceId: "inst-1",
      source: { project: PROJECT, host: "stack" },
      context: FULL,
      backends: [
        { reactor: "ui.main", backend: "main" },
        { reactor: "sb-inst-1", backend: "sb" },
      ],
      collections: { "id-shared": "sb-inst-1", powerhouse: "ui.main" },
      drives: { "id-shared": "shared", powerhouse: "powerhouse" },
      router: {
        defaultBackend: "ui.main",
        probeTimeoutMs: 3_000,
        provisionalRouteMs: 30_000,
      },
      connections: {
        "sb-inst-1": {
          requestTimeoutMs: 30_000,
          breaker: { failures: 3, openMs: 30_000 },
          realtime: true,
        },
      },
      settings: [
        "New drives: in this browser",
        "Finding a document: wait up to 3 s for each reactor",
        "Checking again where a document is: look again after 30 s",
        "Connection to sb: wait up to 30 s, stop trying after 3 failures, try again in 30 s, live updates on",
      ],
    });
  });

  it("builds the router the Connect builds from its host config", () => {
    const { draft } = linkedStack();
    const configured = applySetters(draft.envelope, [
      { path: `${UI}.reactor.placement.newDrives`, value: "sb" },
      { path: `${UI}.reactor.router.probeTimeoutMs`, value: 10_000 },
      { path: `${UI}.reactor.router.provisionalRouteMs`, value: 300_000 },
      {
        path: `${UI}.reactor.backends.sb.remote`,
        value: {
          ...(
            (draft.envelope.host as { children: Record<string, unknown> })
              .children.ui as {
              reactor: { backends: { sb: { remote: object } } };
            }
          ).reactor.backends.sb.remote,
          requestTimeoutMs: 120_000,
          breaker: false,
          realtime: false,
        },
      },
    ]);
    expect(configured.issues).toEqual([]);
    const seed = seedOf({ envelope: configured.envelope });
    expect(seed?.backends.map((entry) => entry.reactor)).toEqual([
      "ui.main",
      "sb-inst-1",
    ]);
    expect(seed?.router).toEqual({
      defaultBackend: "sb-inst-1",
      probeTimeoutMs: 10_000,
      provisionalRouteMs: 300_000,
    });
    expect(seed?.connections).toEqual({
      "sb-inst-1": {
        requestTimeoutMs: 120_000,
        breaker: false,
        realtime: false,
      },
    });
    expect(seed?.settings).toEqual([
      "New drives: on sb",
      "Finding a document: wait up to 10 s for each reactor",
      "Checking again where a document is: look again after 5 min",
      "Connection to sb: wait up to 2 min, never stop trying, live updates off",
    ]);
  });

  it("won't create new drives elsewhere when their switchboard isn't attached", () => {
    const { draft } = linkedStack();
    const linkedByAddress = applySetters(draft.envelope, [
      {
        path: `${UI}.reactor.backends.far`,
        value: { kind: "remote", remote: { url: "https://far.test/d/team" } },
      },
      { path: `${UI}.reactor.placement.newDrives`, value: "far" },
    ]);
    expect(linkedByAddress.issues).toEqual([]);
    const seed = seedOf({ envelope: linkedByAddress.envelope });
    expect(seed?.backends.map((entry) => entry.reactor)).toEqual([
      "ui.main",
      "sb-inst-1",
    ]);
    expect(seed?.router).not.toHaveProperty("defaultBackend");
    const blocked = ROUTE_COPY.newDrivesUnreachable("https://far.test");
    expect(seed?.newDrivesBlocked).toBe(blocked);
    expect(seed?.settings[0]).toBe("New drives: on https://far.test");
    expect(seed?.settings.at(-1)).toBe(blocked);
  });

  it("puts the new drives' switchboard first when the Connect keeps no browser reactor", () => {
    let draft: HostDraft = { envelope: stack() };
    const pick = (id: string) => {
      const option = hostOptions(draft, FULL).find((entry) => entry.id === id);
      expect(option?.reason, id).toBeUndefined();
      draft = applyOption(draft, option!).draft;
    };
    const add = (switchboard: string, name: string) => {
      draft = applyOption(
        draft,
        addDriveStatus(draft, FULL, switchboard, name)!,
      ).draft;
    };
    pick("host:add:switchboard");
    add("host.children.sb", "Shared");
    add("host.children.switchboard", "Shared 2");
    pick(`${UI}:reach:open:sb:shared`);
    pick(`${UI}:reach:open:switchboard:shared-2`);
    pick(`${UI}:newDrives:on:switchboard`);
    pick(`${UI}:reach:remove:main`);
    const seed = seedOf(
      draft,
      runOf({
        attached: {
          browser: [],
          remote: [
            { name: "sb-inst-1", member: "sb" },
            { name: "sw-inst-1", member: "switchboard" },
          ],
        },
      }),
    );
    expect(seed?.backends).toEqual([
      { reactor: "sw-inst-1", backend: "switchboard" },
      { reactor: "sb-inst-1", backend: "sb" },
    ]);
    expect(seed?.router.defaultBackend).toBe("sw-inst-1");
    expect(seed?.settings[0]).toBe("New drives: on switchboard");
  });

  it("names an unplaced linked drive by slug without placing it", () => {
    const { draft } = linkedStack();
    const copied = applySetters(draft.envelope, [
      {
        path: `${UI}.reactor.placement.drives.shared`,
        value: { $delete: true },
      },
    ]).envelope;
    const seed = seedOf({ envelope: copied });
    expect(seed?.drives).toEqual({
      "id-shared": "shared",
      powerhouse: "powerhouse",
    });
    expect(seed?.collections).toEqual({ powerhouse: "ui.main" });
  });

  it("offers nothing until the switchboard is attached", () => {
    const run = runOf();
    expect(
      seedOf(
        linkedStack().draft,
        runOf({ attached: { ...run.attached, remote: [] } }),
      ),
    ).toBeUndefined();
  });
});

describe("startedMembers", () => {
  it("reads the config the copy runs, not later edits to the draft", () => {
    const { setters } = linkedStack();
    const base = addEdit(
      newDraft(
        { kind: "project", project: PROJECT, host: "stack", export: stack() },
        DIGEST,
      ),
      setters,
    );
    const edited = addEdit(base, [
      {
        path: `${UI}.reactor.placement.drives.shared`,
        value: { $delete: true },
      },
    ]);
    const run = runOf({
      source: { project: PROJECT, host: "stack", baseDigest: DIGEST, setters },
    });
    const placed = (members: readonly Member[]) =>
      members.find((member) => member.path === UI)?.reactor?.placement;
    expect(placed(startedMembers(edited, run, []))).toEqual({
      drives: { shared: "sb" },
    });
    expect(
      startedMembers(
        edited,
        runOf({ source: { ...run.source!, baseDigest: "f".repeat(64) } }),
        [],
      ),
    ).toEqual([]);
  });
});

function memoryStorage(): DraftStorage {
  const items = new Map<string, string>();
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
  };
}

describe("savePlacement", () => {
  function stored() {
    const { draft, setters } = linkedStack();
    const storage = memoryStorage();
    const builder = addEdit(
      newDraft(
        { kind: "project", project: PROJECT, host: "stack", export: stack() },
        DIGEST,
      ),
      setters,
    );
    saveDraft(storage, builder);
    return { storage, seed: seedOf(draft)!, edits: builder.edits.length };
  }

  it("adds the move to the builder's draft as one edit", () => {
    const { storage, seed, edits } = stored();
    expect(savePlacement(storage, seed, "shared", "main")).toEqual({
      ok: true,
    });
    const after = loadDraft(storage)!;
    expect(after.edits).toHaveLength(edits + 1);
    const ui = (
      envelopeOf(after).host as {
        children: Record<string, { reactor: Record<string, unknown> }>;
      }
    ).children.ui;
    expect(ui.reactor.placement).toEqual({ drives: {} });
    expect(savePlacement(storage, seed, "shared", "main")).toEqual({
      ok: false,
      reason: SAVE_PLACEMENT.already,
    });
  });

  it("gives the engine's reason for a move the config can't hold", () => {
    const { storage, seed } = stored();
    expect(savePlacement(storage, seed, "powerhouse", "sb")).toEqual({
      ok: false,
      reason: REACH_REASONS.localDrive,
    });
  });

  it("refuses a draft of another host, or none", () => {
    const { storage, seed } = stored();
    expect(
      savePlacement(
        storage,
        { ...seed, source: { ...seed.source, host: "other" } },
        "shared",
        "main",
      ),
    ).toEqual({ ok: false, reason: SAVE_PLACEMENT.otherHost });
    expect(savePlacement(memoryStorage(), seed, "shared", "main")).toEqual({
      ok: false,
      reason: SAVE_PLACEMENT.noDraft,
    });
  });
});
