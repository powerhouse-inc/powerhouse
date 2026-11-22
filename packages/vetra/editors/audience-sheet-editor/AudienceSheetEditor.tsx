import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { actions } from "document-models/audience-sheet";
import type {
  AudienceSheetAction,
  AudienceSheetDocument,
} from "document-models/audience-sheet";
import { AgentFeedbackSection } from "../shared/AgentFeedback.js";
import { SegmentsSection } from "./components/sections.js";

export function AudienceSheetEditor({
  document,
  dispatch,
}: {
  document: AudienceSheetDocument;
  dispatch: DocumentDispatch<AudienceSheetAction>;
}) {
  const state = document.state.global;
  return (
    <div className="flex flex-col gap-8 text-foreground">
      <SegmentsSection segments={state.segments} dispatch={dispatch} />
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
