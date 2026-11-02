// The builder's draft: a host export plus the setters written over it. Pure.
import {
  hostExportSchema,
  type HostExport,
} from "@powerhousedao/host-core/schema";
import { z } from "zod";
import {
  baseDigestSchema,
  blankDigest,
  type DraftRequest,
} from "../controller/api.js";
import { blankExport, folderTemplate, isBlank } from "../host-rules/catalog.js";
import {
  checkSetter,
  setterSchema,
  type HostEnv,
  type Setter,
} from "../host-rules/index.js";
import { applySetters } from "../host-rules/setters.js";

export const STEPS = [
  "start",
  "basics",
  "members",
  "reactor",
  "environment",
  "review",
  "use",
] as const;
export type StepId = (typeof STEPS)[number];

export const DRAFT_STORAGE_KEY = "ph:reactor-monitor:builder-draft";

const baseSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("project"),
    project: z.string().min(1),
    host: z.string().min(1),
    export: hostExportSchema,
  }),
  z.object({
    kind: z.literal("import"),
    export: hostExportSchema,
    fileName: z.string().optional(),
  }),
  z.object({
    kind: z.literal("blank"),
    export: hostExportSchema,
    /** The project it starts in, once one is chosen. */
    project: z.string().min(1).optional(),
  }),
]);
export type DraftBase = z.infer<typeof baseSchema>;

const draftSchema = z
  .object({
    version: z.literal(1),
    base: baseSchema,
    setters: z.array(setterSchema),
    /** How many setters each edit wrote, oldest first; undo pops the last. */
    edits: z.array(z.number().int().positive()),
    // Refused keys stay in the draft so their reasons show.
    env: z.record(z.string(), z.string()),
    step: z.enum(STEPS),
    baseDigest: baseDigestSchema,
  })
  .refine(
    (draft) =>
      draft.edits.reduce((sum, count) => sum + count, 0) ===
      draft.setters.length,
  );
export type BuilderDraft = z.infer<typeof draftSchema>;

export function newDraft(base: DraftBase, baseDigest: string): BuilderDraft {
  return {
    version: 1,
    base,
    setters: [],
    edits: [],
    env: {},
    step: "basics",
    baseDigest,
  };
}

export async function newBlankDraft(): Promise<BuilderDraft> {
  return newDraft(
    { kind: "blank", export: blankExport() },
    await blankDigest(),
  );
}

/** A blank draft set to start in `project`; any other draft is unchanged. */
export function withProject(
  draft: BuilderDraft,
  project: string,
): BuilderDraft {
  if (draft.base.kind !== "blank" || draft.base.project === project) {
    return draft;
  }
  return { ...draft, base: { ...draft.base, project } };
}

/** An imported export of a blank host, which names no project. */
export function isBlankImport(draft: BuilderDraft): boolean {
  return draft.base.kind === "import" && isBlank(draft.base.export);
}

/** A blank draft's start settings; undefined for any other draft. */
export function blankOf(draft: BuilderDraft): { project?: string } | undefined {
  if (draft.base.kind !== "blank") return undefined;
  return draft.base.project === undefined
    ? {}
    : { project: draft.base.project };
}

/** The draft's envelope: its base with every setter applied in order. */
export function envelopeOf(draft: BuilderDraft): HostExport {
  return applySetters(draft.base.export, draft.setters).envelope;
}

/** How many of the setters change the envelope; a no-op delete counts for none. */
export function changedCount(
  envelope: HostExport,
  setters: readonly Setter[],
): number {
  let current = envelope;
  let changed = 0;
  for (const setter of setters) {
    const next = applySetters(current, [setter]).envelope;
    if (JSON.stringify(next) !== JSON.stringify(current)) changed += 1;
    current = next;
  }
  return changed;
}

export function addEdit(
  draft: BuilderDraft,
  setters: readonly Setter[],
): BuilderDraft {
  if (setters.length === 0) return draft;
  return {
    ...draft,
    setters: [...draft.setters, ...setters],
    edits: [...draft.edits, setters.length],
  };
}

export function undoEdit(draft: BuilderDraft): BuilderDraft {
  const last = draft.edits.at(-1);
  if (last === undefined) return draft;
  return {
    ...draft,
    setters: draft.setters.slice(0, draft.setters.length - last),
    edits: draft.edits.slice(0, -1),
  };
}

export function withEnv(draft: BuilderDraft, env: HostEnv): BuilderDraft {
  return { ...draft, env };
}

export function withStep(draft: BuilderDraft, step: StepId): BuilderDraft {
  return draft.step === step ? draft : { ...draft, step };
}

export type DroppedSetter = { path: string; reason: string };

/**
 * The draft over a newer export of its project host: each setter is replayed
 * through the policy and applied in order; one that no longer applies is
 * dropped and named. Edits, env and step are kept.
 */
export function rebaseDraft(
  draft: BuilderDraft,
  envelope: HostExport,
  digest: string,
): { draft: BuilderDraft; dropped: DroppedSetter[] } {
  const { project, host } = sourceOf(draft);
  const dropped: DroppedSetter[] = [];
  const setters: Setter[] = [];
  const edits: number[] = [];
  let current = envelope;
  let at = 0;
  for (const count of draft.edits) {
    let kept = 0;
    for (const written of draft.setters.slice(at, at + count)) {
      const setter = renewedTemplate(draft, written, envelope);
      const verdict = checkSetter(setter, envelope);
      if (!verdict.ok) {
        dropped.push({ path: setter.path, reason: verdict.reason });
        continue;
      }
      const applied = applySetters(current, [setter]);
      if (applied.issues.length > 0) {
        dropped.push({ path: setter.path, reason: applied.issues[0].message });
        continue;
      }
      current = applied.envelope;
      setters.push(setter);
      kept += 1;
    }
    if (kept > 0) edits.push(kept);
    at += count;
  }
  return {
    draft: {
      ...draft,
      base:
        draft.base.kind === "blank"
          ? { ...draft.base, export: envelope }
          : { kind: "project", project, host, export: envelope },
      baseDigest: digest,
      setters,
      edits,
    },
    dropped,
  };
}

/** A blank host's catalog folder, as the current catalog writes it. */
function renewedTemplate(
  draft: BuilderDraft,
  setter: Setter,
  envelope: HostExport,
): Setter {
  const [root, folder, ...rest] = setter.path.split(".");
  if (draft.base.kind !== "blank" || root !== "members" || rest.length > 0) {
    return setter;
  }
  const template = folderTemplate(envelope, folder);
  return template ? { ...setter, value: template as never } : setter;
}

/** Where the draft's host comes from: a project root and its host folder. */
export function sourceOf(draft: BuilderDraft): {
  project: string;
  host: string;
} {
  const { base } = draft;
  if (base.kind === "project")
    return { project: base.project, host: base.host };
  return {
    project:
      (base.kind === "blank" ? base.project : undefined) ??
      base.export.project.root,
    host: base.export.name,
  };
}

/** The body of `POST drafts/check` and `POST drafts`. */
export function requestOf(draft: BuilderDraft): DraftRequest {
  return {
    ...sourceOf(draft),
    baseDigest: draft.baseDigest,
    setters: draft.setters,
    ...(draft.base.kind === "blank" ? { blank: true as const } : {}),
    ...(Object.keys(draft.env).length > 0 ? { env: draft.env } : {}),
  };
}

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** localStorage, or undefined when there is none or touching it throws. */
export function browserStorage(): DraftStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

/** The saved draft; anything unreadable starts a fresh one. */
export function loadDraft(
  storage: DraftStorage | undefined,
): BuilderDraft | undefined {
  let raw: string | null;
  try {
    raw = storage?.getItem(DRAFT_STORAGE_KEY) ?? null;
  } catch {
    return undefined;
  }
  if (raw === null) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const parsed = draftSchema.safeParse(json);
  return parsed.success ? parsed.data : undefined;
}

export const SAVE_FAILED = {
  quota: "This draft is too big to keep after reload.",
  unavailable: "This browser won't keep the draft after reload.",
} as const;

export type SaveResult = { ok: true } | { ok: false; reason: string };

export function saveDraft(
  storage: DraftStorage | undefined,
  draft: BuilderDraft | undefined,
): SaveResult {
  if (!storage) return { ok: false, reason: SAVE_FAILED.unavailable };
  try {
    if (draft === undefined) storage.removeItem(DRAFT_STORAGE_KEY);
    else storage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
    return { ok: true };
  } catch (error) {
    const quota =
      error instanceof DOMException &&
      (error.name === "QuotaExceededError" ||
        error.name === "NS_ERROR_DOM_QUOTA_REACHED");
    return {
      ok: false,
      reason: quota ? SAVE_FAILED.quota : SAVE_FAILED.unavailable,
    };
  }
}
