import { issueCount, ROLE_LABELS } from "./copy.js";
import type { BuilderDraft, StepId } from "./draft.js";
import type { BuilderEngine } from "./engine.js";
import { IssueList } from "./IssueList.js";

/** An aside on wide screens; a sheet over the footer on a phone. */
export function SummaryPanel({
  draft,
  engine,
  open,
  inert,
  onClose,
  onStep,
  onUndo,
}: {
  readonly draft?: BuilderDraft;
  readonly engine?: BuilderEngine;
  readonly open: boolean;
  readonly inert?: boolean;
  readonly onClose: () => void;
  readonly onStep: (step: StepId) => void;
  readonly onUndo: () => void;
}) {
  const count = engine?.issues.length ?? 0;
  return (
    <aside
      aria-label="Summary"
      className="hb-aside"
      data-open={open ? "true" : "false"}
      inert={inert}
    >
      <div className="hb-row">
        <h2 className="hb-h2">Host so far</h2>
        <button
          className="hb-btn hb-btn-sm hb-sum-close"
          onClick={onClose}
          type="button"
        >
          Close
        </button>
      </div>
      {draft && engine ? (
        <>
          <span className="hb-pill" data-state={count === 0 ? "ok" : "bad"}>
            {issueCount(count)}
          </span>
          <div className="hb-field">
            <span className="hb-flabel">Host</span>
            <span className="hb-mono">{engine.envelope.name}</span>
          </div>
          <div className="hb-field">
            <span className="hb-flabel">Reactors</span>
            <ul className="hb-list">
              {engine.members.map((member) => (
                <li key={member.path}>
                  {member.key}{" "}
                  <span className="hb-note">{ROLE_LABELS[member.role]}</span>
                </li>
              ))}
            </ul>
          </div>
          {count > 0 ? (
            <div className="hb-field">
              <span className="hb-flabel">Issues</span>
              <IssueList issues={engine.issues} limit={5} onStep={onStep} />
            </div>
          ) : null}
          {draft.edits.length > 0 ? (
            <div>
              <button
                className="hb-btn hb-btn-sm"
                onClick={onUndo}
                type="button"
              >
                Undo the last change
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <p className="hb-note">Pick a host on the Start step.</p>
      )}
    </aside>
  );
}
