import type { HostExport } from "@powerhousedao/host-core/schema";
import { useId, useState } from "react";
import { ControllerRequestError, errorMessage } from "../controller/client.js";
import type { BuilderClient } from "./client.js";
import { downloadExport } from "./download.js";
import { newDraft, rebaseDraft, sourceOf, type BuilderDraft } from "./draft.js";
import type { BuilderEngine } from "./engine.js";

/** The controller refused the draft because its project host changed. */
export function isBaseChanged(error: unknown): boolean {
  return (
    error instanceof ControllerRequestError && error.code === "base_changed"
  );
}

type Rebased = ReturnType<typeof rebaseDraft>;

/** A rebase shown but not saved; `from` is the draft it was computed from. */
type Preview = {
  from: BuilderDraft;
  export: HostExport;
  digest: string;
  result: Rebased;
  changed?: boolean;
};

function sameResult(a: Rebased, b: Rebased): boolean {
  const key = ({ draft, dropped }: Rebased) =>
    JSON.stringify([draft.setters, draft.edits, draft.env, dropped]);
  return key(a) === key(b);
}

type Outcome = { kind: "applied" } | { kind: "discarded" };

/** Offers to carry the draft's changes over to the host's new version. */
export function BaseChanged({
  client,
  draft,
  engine,
  onDraft,
  onClose,
  onLock,
}: {
  readonly client?: BuilderClient;
  readonly draft: BuilderDraft;
  readonly engine: BuilderEngine;
  readonly onDraft: (draft: BuilderDraft) => void;
  readonly onClose: () => void;
  /** True while the preview is open: nothing else may edit the draft. */
  readonly onLock: (locked: boolean) => void;
}) {
  const titleId = useId();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [preview, setPreview] = useState<Preview | undefined>();
  const [outcome, setOutcome] = useState<Outcome | undefined>();

  const fetchNew = async () => {
    if (!client) throw new Error("The monitor's controller isn't running.");
    const { project, host } = sourceOf(draft);
    return { project, host, ...(await client.exportHost(project, host)) };
  };

  const apply = async () => {
    setBusy(true);
    setStatus("");
    try {
      const fresh = await fetchNew();
      setPreview({
        from: draft,
        export: fresh.export,
        digest: fresh.baseDigest,
        result: rebaseDraft(draft, fresh.export, fresh.baseDigest),
      });
      onLock(true);
    } catch (error) {
      setStatus(`Couldn't load the new version: ${errorMessage(error)}`);
    }
    setBusy(false);
  };

  /** Saves only a rebase of the draft as it is now, and only if it was shown. */
  const confirm = () => {
    if (!preview) return;
    const again = rebaseDraft(draft, preview.export, preview.digest);
    if (!sameResult(again, preview.result)) {
      setPreview({ ...preview, from: draft, result: again, changed: true });
      return;
    }
    onDraft(again.draft);
    setPreview(undefined);
    setOutcome({ kind: "applied" });
    onLock(false);
  };

  const cancel = () => {
    setPreview(undefined);
    setStatus("");
    onLock(false);
  };

  const discard = async () => {
    setBusy(true);
    setStatus("");
    try {
      const fresh = await fetchNew();
      onDraft({
        ...newDraft(
          {
            kind: "project",
            project: fresh.project,
            host: fresh.host,
            export: fresh.export,
          },
          fresh.baseDigest,
        ),
        step: draft.step,
      });
      setOutcome({ kind: "discarded" });
    } catch (error) {
      setStatus(`Couldn't load the new version: ${errorMessage(error)}`);
    }
    setBusy(false);
  };

  if (outcome) {
    return (
      <div className="hb-banner hb-rebase" role="alert">
        <span>
          {outcome.kind === "discarded"
            ? "The new version is loaded without your changes."
            : "Your changes are on the new version now. The checks ran again."}
        </span>
        <button className="hb-link" onClick={onClose} type="button">
          Dismiss
        </button>
      </div>
    );
  }

  if (preview) {
    const { from, result } = preview;
    const kept = result.draft.setters;
    return (
      <div className="hb-modal">
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className="hb-dialog"
          role="dialog"
        >
          <span className="hb-flabel" id={titleId}>
            Your changes on the new version
          </span>
          {preview.changed ? (
            <span className="hb-why">
              Your draft changed while this was open, so this is the updated
              result. Confirm again to save it.
            </span>
          ) : null}
          <span>
            Nothing is saved until you confirm. Your current draft stays as it
            is until then.
          </span>
          <span>
            {kept.length === from.setters.length
              ? `All ${kept.length} of your changes carry over.`
              : `${kept.length} of your ${from.setters.length} changes carry over.`}
          </span>
          {kept.length > 0 ? (
            <ul aria-label="Carried over" className="hb-list hb-fpath hb-mono">
              {kept.map((setter, index) => (
                <li key={`${index}\0${setter.path}`}>{setter.path}</li>
              ))}
            </ul>
          ) : null}
          {result.dropped.length > 0 ? (
            <>
              <span>
                These don't apply to the new version and would be lost:
              </span>
              <ul aria-label="Left out" className="hb-issues">
                {result.dropped.map((setter, index) => (
                  <li className="hb-issue" key={`${index}\0${setter.path}`}>
                    <span>{setter.reason}</span>
                    <span className="hb-fpath hb-mono">{setter.path}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <div className="hb-opts">
            <button
              className="hb-btn hb-btn-primary"
              onClick={confirm}
              type="button"
            >
              Confirm
            </button>
            <button
              className="hb-btn"
              onClick={() => setStatus(downloadExport(engine.envelope))}
              type="button"
            >
              Download my old version
            </button>
            <button className="hb-btn" onClick={cancel} type="button">
              Cancel
            </button>
          </div>
          {status ? <span role="status">{status}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="hb-banner hb-rebase" role="alert">
      <div className="hb-field">
        <span className="hb-flabel">This host changed in its project</span>
        <span>
          Its host files changed after this draft was made, so the controller
          won't check or start the draft as it is. Your changes are still here.
        </span>
        <div className="hb-opts">
          <button
            className="hb-btn hb-btn-primary"
            disabled={busy || !client}
            onClick={() => void apply()}
            type="button"
          >
            Apply my changes to the new version
          </button>
          <button
            className="hb-btn"
            disabled={busy}
            onClick={() => setStatus(downloadExport(engine.envelope))}
            type="button"
          >
            Keep my version
          </button>
          <button
            className="hb-btn"
            disabled={busy || !client}
            onClick={() => void discard()}
            type="button"
          >
            Discard my changes
          </button>
        </div>
        <span className="hb-note">
          Keep my version downloads your draft as an export file and leaves the
          draft as it is. Discard my changes loads the new version without them.
        </span>
        {status ? <span role="status">{status}</span> : null}
      </div>
    </div>
  );
}
