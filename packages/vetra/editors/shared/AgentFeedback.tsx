import { Pill, Section } from "./fields.js";

type SuggestionResolution = {
  decision: "ACCEPTED" | "DISMISSED";
  changeApplied: boolean;
  comment: string | null | undefined;
  resolvedAt: string;
};

type Suggestion = {
  id: string;
  agent: string;
  content: string;
  createdAt: string;
  resolution: SuggestionResolution | null | undefined;
};

type Feedback = {
  readyForFeedback: boolean;
  suggestions: Suggestion[];
};

/**
 * Shared agent-feedback panel for the identity sheets and the feature.
 * Read-mostly: the builder flags readiness and accepts / dismisses each
 * agent suggestion. Action wiring is supplied by the host editor since the
 * action creators are per-model.
 */
export function AgentFeedbackSection({
  feedback,
  onToggleReady,
  onResolve,
  onRemove,
}: {
  feedback: Feedback;
  onToggleReady: (ready: boolean) => void;
  onResolve: (id: string, decision: "ACCEPTED" | "DISMISSED") => void;
  onRemove: (id: string) => void;
}) {
  const open = feedback.suggestions.filter((s) => !s.resolution);
  const resolved = feedback.suggestions.filter((s) => s.resolution);

  return (
    <Section
      title="Agent Feedback"
      action={
        <label className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={feedback.readyForFeedback}
            onChange={(e) => onToggleReady(e.target.checked)}
          />
          Ready for feedback
        </label>
      }
    >
      {feedback.suggestions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No suggestions yet.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {open.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-border bg-card p-3"
            >
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  {s.agent}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onResolve(s.id, "ACCEPTED")}
                    className="rounded-sm border border-success/30 px-2 py-0.5 text-xs text-success hover:bg-success/10"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onResolve(s.id, "DISMISSED")}
                    className="rounded-sm border border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
              <p className="text-sm text-foreground">{s.content}</p>
            </div>
          ))}
          {resolved.map((s) => (
            <div
              key={s.id}
              className="flex items-start justify-between gap-3 rounded-lg border border-border/40 bg-accent p-3"
            >
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    {s.agent}
                  </span>
                  <Pill
                    tone={
                      s.resolution?.decision === "ACCEPTED"
                        ? "prefer"
                        : "neutral"
                    }
                  >
                    {s.resolution?.decision === "ACCEPTED"
                      ? "Accepted"
                      : "Dismissed"}
                  </Pill>
                </div>
                <p className="truncate text-sm text-muted-foreground">
                  {s.content}
                </p>
              </div>
              <button
                type="button"
                aria-label="Remove suggestion"
                onClick={() => onRemove(s.id)}
                className="text-border hover:text-destructive"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
