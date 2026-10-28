import { useState } from "react";
import type { DraftCheckResponse } from "../../controller/api.js";
import { errorMessage } from "../../controller/client.js";
import { isBaseChanged } from "../BaseChanged.js";
import type { BuilderClient } from "../client.js";
import { issueCount, NO_CONTROLLER } from "../copy.js";
import { requestOf } from "../draft.js";
import { IssueList } from "../IssueList.js";
import { JsonPreview } from "../JsonPreview.js";
import type { StepProps } from "./types.js";

function ControllerCheck({
  client,
  draft,
  onBaseChanged,
}: Pick<StepProps, "draft"> & {
  readonly client?: BuilderClient;
  readonly onBaseChanged: () => void;
}) {
  const [result, setResult] = useState<DraftCheckResponse | undefined>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!client) return;
    setBusy(true);
    setError("");
    try {
      setResult(await client.checkDraft(requestOf(draft)));
    } catch (caught) {
      setResult(undefined);
      if (isBaseChanged(caught)) onBaseChanged();
      else setError(errorMessage(caught));
    }
    setBusy(false);
  };
  const found = result ? result.ruleIssues.length + result.issues.length : 0;
  return (
    <div className="hb-card hb-sec">
      <div className="hb-flabel">Check on the controller</div>
      <p className="hb-note">
        The controller loads the host the way it would start it and runs every
        check again.
      </p>
      <div>
        <button
          className="hb-btn"
          disabled={!client || busy}
          onClick={() => void check()}
          type="button"
        >
          {busy ? "Checking…" : "Check now"}
        </button>
      </div>
      {client ? null : (
        <p className="hb-why">
          <b>Check now:</b> {NO_CONTROLLER}
        </p>
      )}
      {error ? <p className="hb-error">{error}</p> : null}
      {result ? (
        <>
          <p className="hb-note">
            The controller found: {issueCount(found).toLowerCase()}.
          </p>
          <IssueList issues={result.ruleIssues} />
          {result.issues.length > 0 ? (
            <ul className="hb-issues">
              {result.issues.map((issue) => (
                <li
                  className="hb-issue"
                  key={`${issue.stage}\0${issue.file}\0${issue.path}\0${issue.message}`}
                >
                  <span>{issue.message}</span>
                  <span className="hb-fpath hb-mono">
                    {[issue.stage, issue.file, issue.path, issue.hint]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export function ReviewStep({
  client,
  draft,
  engine,
  onStep,
  onBaseChanged = () => undefined,
}: StepProps & {
  readonly client?: BuilderClient;
  readonly onBaseChanged?: () => void;
}) {
  const count = engine.issues.length;
  return (
    <section className="hb-step">
      <h2 className="hb-h2">Review</h2>
      <p className="hb-note">
        The builder runs the host's checks on every change. Each issue links to
        the step that fixes it.
      </p>
      <div>
        <span className="hb-pill" data-state={count === 0 ? "ok" : "bad"}>
          {issueCount(count)}
        </span>
      </div>
      <IssueList issues={engine.issues} onStep={onStep} />
      <ControllerCheck
        client={client}
        draft={draft}
        onBaseChanged={onBaseChanged}
      />
      <JsonPreview env={draft.env} envelope={engine.envelope} />
    </section>
  );
}
