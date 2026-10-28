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

type Outcome =
  | { kind: "applied"; kept: number; dropped: DroppedSetter[] }
  | { kind: "discarded" };

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
      const rebased = rebaseDraft(draft, fresh.export, fresh.baseDigest);
      onDraft(rebased.draft);
      setOutcome({
        kind: "applied",
        kept: rebased.draft.setters.length,
        dropped: rebased.dropped,
      });
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
        <div className="hb-field">
          {outcome.kind === "discarded" ? (
            <span>The new version is loaded without your changes.</span>
          ) : outcome.dropped.length === 0 ? (
            <span>
              All your changes now apply to the new version. The checks ran
              again.
            </span>
          ) : (
            <>
              <span>
                {outcome.kept} of your changes apply to the new version. These
                no longer apply and were left out:
              </span>
              <ul className="hb-issues">
                {outcome.dropped.map((setter, index) => (
                  <li className="hb-issue" key={`${index}\0${setter.path}`}>
                    <span>{setter.reason}</span>
                    <span className="hb-fpath hb-mono">{setter.path}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <button className="hb-link" onClick={onClose} type="button">
          Dismiss
        </button>
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
