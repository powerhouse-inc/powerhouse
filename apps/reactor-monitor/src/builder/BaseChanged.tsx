import { useState } from "react";
import { ControllerRequestError, errorMessage } from "../controller/client.js";
import type { BuilderClient } from "./client.js";
import { downloadExport } from "./download.js";
import {
  newDraft,
  rebaseDraft,
  sourceOf,
  type BuilderDraft,
  type DroppedSetter,
} from "./draft.js";
import type { BuilderEngine } from "./engine.js";

/** The controller refused the draft because its project host changed. */
export function isBaseChanged(error: unknown): boolean {
  return (
    error instanceof ControllerRequestError && error.code === "base_changed"
  );
}

type Preview = { draft: BuilderDraft; dropped: DroppedSetter[] };

type Outcome = { kind: "applied" } | { kind: "discarded" };

/** Offers to carry the draft's changes over to the host's new version. */
export function BaseChanged({
  client,
  draft,
  engine,
  onDraft,
  onClose,
}: {
  readonly client?: BuilderClient;
  readonly draft: BuilderDraft;
  readonly engine: BuilderEngine;
  readonly onDraft: (draft: BuilderDraft) => void;
  readonly onClose: () => void;
}) {
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
      setPreview(rebaseDraft(draft, fresh.export, fresh.baseDigest));
    } catch (error) {
      setStatus(`Couldn't load the new version: ${errorMessage(error)}`);
    }
    setBusy(false);
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
    const kept = preview.draft.setters;
    return (
      <div className="hb-banner hb-rebase" role="alert">
        <div className="hb-field">
          <span className="hb-flabel">Your changes on the new version</span>
          <span>
            Nothing is saved until you confirm. Your current draft stays as it
            is until then.
          </span>
          <span>
            {kept.length === draft.setters.length
              ? `All ${kept.length} of your changes carry over.`
              : `${kept.length} of your ${draft.setters.length} changes carry over.`}
          </span>
          {kept.length > 0 ? (
            <ul className="hb-list hb-fpath hb-mono" aria-label="Carried over">
              {kept.map((setter, index) => (
                <li key={`${index}\0${setter.path}`}>{setter.path}</li>
              ))}
            </ul>
          ) : null}
          {preview.dropped.length > 0 ? (
            <>
              <span>
                These don't apply to the new version and would be lost:
              </span>
              <ul aria-label="Left out" className="hb-issues">
                {preview.dropped.map((setter, index) => (
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
              onClick={() => {
                onDraft(preview.draft);
                setPreview(undefined);
                setOutcome({ kind: "applied" });
              }}
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
            <button
              className="hb-btn"
              onClick={() => {
                setPreview(undefined);
                setStatus("");
              }}
              type="button"
            >
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
