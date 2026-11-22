import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { actions } from "document-models/problem-sheet";
import type {
  ProblemSheetAction,
  ProblemSheetDocument,
} from "document-models/problem-sheet";
import { AgentFeedbackSection } from "../shared/AgentFeedback.js";
import {
  ConstraintsSection,
  ContextSection,
  CoreJobSection,
  JobStepsSection,
  OutcomesSection,
  RolesSection,
} from "./components/sections.js";

export function ProblemSheetEditor({
  document,
  dispatch,
}: {
  document: ProblemSheetDocument;
  dispatch: DocumentDispatch<ProblemSheetAction>;
}) {
  const state = document.state.global;
  // Stand-in product name from the document title; the cross-document pass
  // resolves this from the Brand Sheet.
  const productName = document.header.name
    .replace(/\s*problem sheet$/i, "")
    .trim();
  return (
    <div className="flex flex-col gap-8 text-foreground">
      <ContextSection state={state} dispatch={dispatch} />
      <CoreJobSection
        state={state}
        productName={productName}
        dispatch={dispatch}
      />
      <JobStepsSection state={state} dispatch={dispatch} />
      <RolesSection state={state} dispatch={dispatch} />
      <OutcomesSection state={state} dispatch={dispatch} />
      <ConstraintsSection state={state} dispatch={dispatch} />
      <AgentFeedbackSection
        feedback={state.agentFeedback}
        onToggleReady={(ready) =>
          dispatch(actions.setReadyForFeedback({ ready }))
        }
        onResolve={(id, decision) =>
          dispatch(
            actions.resolveSuggestion({
              id,
              decision,
              changeApplied: decision === "ACCEPTED",
              resolvedAt: new Date().toISOString(),
            }),
          )
        }
        onRemove={(id) => dispatch(actions.removeSuggestion({ id }))}
      />
    </div>
  );
}
