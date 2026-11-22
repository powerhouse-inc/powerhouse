import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { actions } from "document-models/feature";
import type { FeatureAction, FeatureDocument } from "document-models/feature";
import { AgentFeedbackSection } from "../shared/AgentFeedback.js";
import {
  BetSection,
  EstimatesSection,
  EvidenceSection,
  FeatureHeader,
  SegmentsSection,
  TargetsSection,
} from "./components/sections.js";

export function FeatureEditor({
  document,
  dispatch,
}: {
  document: FeatureDocument;
  dispatch: DocumentDispatch<FeatureAction>;
}) {
  const state = document.state.global;
  return (
    <div className="flex flex-col gap-8 text-foreground">
      <FeatureHeader state={state} dispatch={dispatch} />
      <BetSection state={state} dispatch={dispatch} />
      <EstimatesSection state={state} dispatch={dispatch} />
      <TargetsSection state={state} dispatch={dispatch} />
      <SegmentsSection state={state} dispatch={dispatch} />
      <EvidenceSection state={state} dispatch={dispatch} />
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
