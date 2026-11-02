import type { HostRuleIssue } from "../host-rules/index.js";
import { STEP_LABELS } from "./copy.js";
import type { StepId } from "./draft.js";
import { stepOf } from "./engine.js";

/** Each issue's sentence, its technical detail second, and a link to its step. */
export function IssueList({
  issues,
  onStep,
  limit,
}: {
  readonly issues: readonly HostRuleIssue[];
  readonly onStep?: (step: StepId) => void;
  readonly limit?: number;
}) {
  if (issues.length === 0) return null;
  const shown = limit === undefined ? issues : issues.slice(0, limit);
  return (
    <ul className="hb-issues">
      {shown.map((issue) => {
        const step = stepOf(issue.path);
        return (
          <li className="hb-issue" key={`${issue.path}\0${issue.message}`}>
            <span>{issue.message}</span>
            <span className="hb-fpath hb-mono">
              {issue.hint ? `${issue.path} · ${issue.hint}` : issue.path}
            </span>
            {onStep ? (
              <button
                className="hb-link"
                onClick={() => onStep(step)}
                type="button"
              >
                Go to {STEP_LABELS[step]}
              </button>
            ) : null}
          </li>
        );
      })}
      {shown.length < issues.length ? (
        <li className="hb-note">and {issues.length - shown.length} more</li>
      ) : null}
    </ul>
  );
}
