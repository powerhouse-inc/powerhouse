import { describe, expect, it } from "vitest";
import { FULL, stack } from "../host-rules/__fixtures__/hosts.js";
import {
  membersOf,
  REACH_REASONS,
  type HostDraft,
  type Member,
} from "../host-rules/index.js";
import type { RouteSeed } from "../lib/route-seed.js";
import { PROJECT } from "./__fixtures__/fakes.js";
import { linkedStack, runOf } from "./__fixtures__/route.js";
import { DIGEST } from "./__fixtures__/steps.js";
import { SAVE_PLACEMENT } from "./copy.js";
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
    });
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
