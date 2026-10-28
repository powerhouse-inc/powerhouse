import { describe, expect, it } from "vitest";
import { baseDigest, draftRequestSchema } from "../controller/api.js";
import { hostExport, stack } from "../host-rules/__fixtures__/hosts.js";
import { applySetters } from "../host-rules/setters.js";
import { memoryStorage } from "./__fixtures__/fakes.js";
import {
  addEdit,
  changedCount,
  DRAFT_STORAGE_KEY,
  envelopeOf,
  loadDraft,
  newDraft,
  rebaseDraft,
  requestOf,
  SAVE_FAILED,
  saveDraft,
  undoEdit,
  withEnv,
  type DraftStorage,
} from "./draft.js";

const SB_MAIN = "members.switchboard.reactor.backends.main";

async function projectDraft() {
  const envelope = stack();
  return newDraft(
    { kind: "project", project: "/project", host: "stack", export: envelope },
    await baseDigest(envelope),
  );
}

describe("draft", () => {
  it("replays its setters over the base, and undo pops one edit", async () => {
    const draft = await projectDraft();
    const one = addEdit(draft, [
      { path: `${SB_MAIN}.storage.kind`, value: "postgres" },
      { path: `${SB_MAIN}.storage.dataDir`, value: { $delete: true } },
    ]);
    const two = addEdit(one, [{ path: "host.name", value: "renamed" }]);
    expect(two.edits).toEqual([2, 1]);
    const envelope = envelopeOf(two);
    expect((envelope.host as { name: string }).name).toBe("renamed");
    expect(envelope.members.switchboard).toMatchObject({
      reactor: { backends: { main: { storage: { kind: "postgres" } } } },
    });
    expect(undoEdit(two)).toEqual(one);
    expect(undoEdit(undoEdit(two))).toEqual(draft);
    expect(undoEdit(draft)).toBe(draft);
    expect(addEdit(draft, [])).toBe(draft);
  });

  it("carries every edit over to a new version of the host", async () => {
    const draft = withEnv(
      addEdit(
        addEdit(await projectDraft(), [
          { path: "host.name", value: "renamed" },
        ]),
        [{ path: `${SB_MAIN}.storage.kind`, value: "postgres" }],
      ),
      { LOG_LEVEL: "debug" },
    );
    const fresh = applySetters(stack(), [
      { path: "members.switchboard.runner.port", value: 4555 },
    ]).envelope;
    const digest = await baseDigest(fresh);
    const { draft: rebased, dropped } = rebaseDraft(draft, fresh, digest);
    expect(dropped).toEqual([]);
    expect(rebased).toEqual({
      ...draft,
      base: {
        kind: "project",
        project: "/project",
        host: "stack",
        export: fresh,
      },
      baseDigest: digest,
    });
    expect(envelopeOf(rebased).members.switchboard).toMatchObject({
      runner: { port: 4555 },
      reactor: { backends: { main: { storage: { kind: "postgres" } } } },
    });
  });

  it("names each edit that no longer applies and keeps the rest", async () => {
    const draft = addEdit(
      addEdit(await projectDraft(), [{ path: "host.name", value: "renamed" }]),
      [
        { path: "host.children.ui.runner.dev", value: true },
        { path: "members.connect.runner.dev", value: true },
      ],
    );
    const base = stack();
    const host = base.host as { children: Record<string, unknown> };
    const { connect: _connect, ...members } = base.members;
    const fresh = {
      ...base,
      host: { ...host, children: { sb: host.children.sb } },
      members,
    } as typeof base;
    const { draft: rebased, dropped } = rebaseDraft(
      draft,
      fresh,
      await baseDigest(fresh),
    );
    expect(dropped).toEqual([
      {
        path: "host.children.ui.runner.dev",
        reason: "There is no host.children.ui in this host.",
      },
      {
        path: "members.connect.runner.dev",
        reason: "There is no members.connect in this host.",
      },
    ]);
    expect(rebased.setters).toEqual([{ path: "host.name", value: "renamed" }]);
    expect(rebased.edits).toEqual([1]);
    expect((envelopeOf(rebased).host as { name: string }).name).toBe("renamed");
  });

  it("counts only setters that change the envelope", () => {
    const envelope = stack();
    expect(
      changedCount(envelope, [
        { path: `${SB_MAIN}.storage.kind`, value: "memory" },
        { path: `${SB_MAIN}.storage.url`, value: { $delete: true } },
        { path: "host.name", value: "stack" },
      ]),
    ).toBe(1);
  });

  it("makes a strict draft request from a project or an import", async () => {
    const draft = withEnv(
      addEdit(await projectDraft(), [{ path: "host.name", value: "x" }]),
      { LOG_LEVEL: "debug" },
    );
    const request = requestOf(draft);
    expect(draftRequestSchema.parse(request)).toEqual({
      project: "/project",
      host: "stack",
      baseDigest: draft.baseDigest,
      setters: [{ path: "host.name", value: "x" }],
      env: { LOG_LEVEL: "debug" },
    });
    const imported = newDraft(
      { kind: "import", export: hostExport("vetra") },
      draft.baseDigest,
    );
    expect(requestOf(imported)).toMatchObject({
      project: "/project",
      host: "vetra",
    });
    expect(requestOf(imported)).not.toHaveProperty("env");
  });

  it("survives a save and load, and drops anything unreadable", async () => {
    const storage = memoryStorage();
    const draft = withEnv(
      addEdit(await projectDraft(), [{ path: "host.name", value: "x" }]),
      { "not a key": "kept" },
    );
    expect(saveDraft(storage, draft)).toEqual({ ok: true });
    expect(loadDraft(storage)).toEqual(draft);

    storage.data.set(DRAFT_STORAGE_KEY, "{not json");
    expect(loadDraft(storage)).toBeUndefined();
    storage.data.set(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, edits: [5] }),
    );
    expect(loadDraft(storage)).toBeUndefined();
    storage.data.set(
      DRAFT_STORAGE_KEY,
      JSON.stringify({ ...draft, version: 2 }),
    );
    expect(loadDraft(storage)).toBeUndefined();

    expect(saveDraft(storage, undefined)).toEqual({ ok: true });
    expect(storage.data.has(DRAFT_STORAGE_KEY)).toBe(false);
  });

  it("says why a draft can't be kept, and never throws", async () => {
    const draft = await projectDraft();
    const throwing = (error: unknown): DraftStorage => ({
      getItem: () => {
        throw error;
      },
      setItem: () => {
        throw error;
      },
      removeItem: () => {
        throw error;
      },
    });
    expect(
      saveDraft(
        throwing(new DOMException("full", "QuotaExceededError")),
        draft,
      ),
    ).toEqual({ ok: false, reason: SAVE_FAILED.quota });
    expect(saveDraft(throwing(new Error("blocked")), draft)).toEqual({
      ok: false,
      reason: SAVE_FAILED.unavailable,
    });
    expect(saveDraft(undefined, draft)).toEqual({
      ok: false,
      reason: SAVE_FAILED.unavailable,
    });
    expect(loadDraft(throwing(new Error("blocked")))).toBeUndefined();
  });
});
