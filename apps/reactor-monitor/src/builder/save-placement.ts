// "Save to host config": a Router move becomes an edit in the builder's draft.
import { placementStatus } from "../host-rules/index.js";
import type { RouteSeed, SaveVerdict } from "../lib/route-seed.js";
import { SAVE_PLACEMENT } from "./copy.js";
import {
  addEdit,
  envelopeOf,
  loadDraft,
  saveDraft,
  sourceOf,
  type DraftStorage,
} from "./draft.js";

/** Safe only while the builder is closed: it reads the draft when it opens. */
export function savePlacement(
  storage: DraftStorage | undefined,
  seed: RouteSeed,
  drive: string,
  backend: string,
): SaveVerdict {
  const draft = loadDraft(storage);
  if (!draft) return { ok: false, reason: SAVE_PLACEMENT.noDraft };
  const { project, host } = sourceOf(draft);
  if (project !== seed.source.project || host !== seed.source.host) {
    return { ok: false, reason: SAVE_PLACEMENT.otherHost };
  }
  const status = placementStatus(
    { envelope: envelopeOf(draft), env: draft.env },
    seed.context,
    seed.member,
    drive,
    backend,
  );
  if (!status) return { ok: false, reason: SAVE_PLACEMENT.noApp(seed.app) };
  if (status.selected) return { ok: false, reason: SAVE_PLACEMENT.already };
  if (!status.enabled) {
    return { ok: false, reason: status.reason ?? SAVE_PLACEMENT.refused };
  }
  const saved = saveDraft(storage, addEdit(draft, status.setters));
  return saved.ok ? { ok: true } : { ok: false, reason: saved.reason };
}
