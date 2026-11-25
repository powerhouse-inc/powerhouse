import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import { actions } from "document-models/feature";
import type {
  Effort,
  Evidence,
  EvidenceSource,
  FeatureAction,
  FeatureScope,
  FeatureState,
  FeatureStatus,
  OutcomeTarget,
  SegmentRef,
} from "document-models/feature";
import { useState } from "react";
import {
  Card,
  ClearButton,
  EditableNumber,
  EditableText,
  EmptyHint,
  Field,
  LinkButton,
  Pill,
  RemoveButton,
  Section,
  Select,
  titleCase,
} from "../../shared/fields.js";

type Dispatch = DocumentDispatch<FeatureAction>;

const SCOPES: FeatureScope[] = [
  "MICRO_MVP",
  "MARKET_MVP",
  "INCREMENTAL",
  "MAINTENANCE",
];
const SOURCES: EvidenceSource[] = ["BUILDER", "AI_SIMULATION", "USER_RESEARCH"];
const LEVELS: ("LOW" | "MEDIUM" | "HIGH")[] = ["LOW", "MEDIUM", "HIGH"];
const EFFORTS: Effort[] = ["SMALL", "MEDIUM", "LARGE"];

const STATUS_TONE: Record<FeatureStatus, "neutral" | "info" | "prefer"> = {
  PROPOSED: "neutral",
  EVALUATING: "info",
  COMMITTED: "info",
  IN_SPEC: "prefer",
  PARKED: "neutral",
  ARCHIVED: "neutral",
};

/** Header: name, summary, scope, and the lifecycle status with transitions. */
export function FeatureHeader({
  state,
  dispatch,
}: {
  state: FeatureState;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-accent p-5">
      <div className="flex items-center gap-2">
        <Pill tone={STATUS_TONE[state.status]}>{titleCase(state.status)}</Pill>
        <Select
          value={state.scope}
          options={SCOPES}
          onChange={(scope) => dispatch(actions.setScope({ scope }))}
        />
      </div>
      <EditableText
        value={state.name}
        placeholder="Feature name"
        variant="plain"
        onCommit={(name) => dispatch(actions.setFeatureName({ name }))}
        className="text-2xl font-semibold text-foreground"
      />
      <EditableText
        value={state.summary}
        placeholder="One-line summary"
        variant="plain"
        onCommit={(summary) => dispatch(actions.setSummary({ summary }))}
        className="text-sm text-muted-foreground"
      />
      <LifecycleControls status={state.status} dispatch={dispatch} />
    </div>
  );
}

function LifecycleControls({
  status,
  dispatch,
}: {
  status: FeatureStatus;
  dispatch: Dispatch;
}) {
  const btn = (label: string, onClick: () => void) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className="rounded-sm border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-muted"
    >
      {label}
    </button>
  );

  const transitions: React.ReactNode[] = [];
  if (status === "PROPOSED")
    transitions.push(
      btn("Start evaluation", () => dispatch(actions.startEvaluation({}))),
    );
  if (status === "EVALUATING")
    transitions.push(btn("Commit", () => dispatch(actions.commitFeature({}))));
  if (status === "COMMITTED")
    transitions.push(
      btn("Promote to spec", () =>
        dispatch(
          actions.promoteToSpec({ promotedAt: new Date().toISOString() }),
        ),
      ),
    );
  if (status !== "PARKED" && status !== "ARCHIVED")
    transitions.push(btn("Park", () => dispatch(actions.parkFeature({}))));
  if (status !== "ARCHIVED")
    transitions.push(
      btn("Archive", () => dispatch(actions.archiveFeature({}))),
    );
  if (status === "PARKED" || status === "ARCHIVED")
    transitions.push(btn("Reopen", () => dispatch(actions.reopenFeature({}))));

  return <div className="flex flex-wrap gap-1.5">{transitions}</div>;
}

/** The bet: premise / expected effect / reasoning triad. */
export function BetSection({
  state,
  dispatch,
}: {
  state: FeatureState;
  dispatch: Dispatch;
}) {
  return (
    <Section title="The Bet">
      <div className="flex flex-col gap-3 text-sm/relaxed">
        <div>
          <span className="text-muted-foreground">By building </span>
          <EditableText
            value={state.premise}
            placeholder="the premise — what we'll build"
            multiline
            onCommit={(premise) => dispatch(actions.setPremise({ premise }))}
            className="text-foreground"
          />
        </div>
        <div>
          <span className="text-muted-foreground">we expect </span>
          <EditableText
            value={state.expectedEffect}
            placeholder="the expected outcome change"
            multiline
            onCommit={(expectedEffect) =>
              dispatch(actions.setExpectedEffect({ expectedEffect }))
            }
            className="text-foreground"
          />
        </div>
        <div>
          <span className="text-muted-foreground">because </span>
          <EditableText
            value={state.reasoning}
            placeholder="the reasoning being tested"
            multiline
            onCommit={(reasoning) =>
              dispatch(actions.setReasoning({ reasoning }))
            }
            className="text-foreground"
          />
        </div>
      </div>
    </Section>
  );
}

/** Coarse confidence / effort / impact estimates plus release & notes. */
export function EstimatesSection({
  state,
  dispatch,
}: {
  state: FeatureState;
  dispatch: Dispatch;
}) {
  return (
    <Section
      title="Estimates"
      action={
        state.confidence || state.effort || state.impact ? (
          <ClearButton onClick={() => dispatch(actions.clearEstimates({}))}>
            Clear
          </ClearButton>
        ) : undefined
      }
    >
      <Card className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Confidence">
            <Select
              value={state.confidence ?? "MEDIUM"}
              options={LEVELS}
              className="w-full"
              onChange={(confidence) =>
                dispatch(actions.setConfidence({ confidence }))
              }
            />
          </Field>
          <Field label="Effort">
            <Select
              value={state.effort ?? "MEDIUM"}
              options={EFFORTS}
              className="w-full"
              onChange={(effort) => dispatch(actions.setEffort({ effort }))}
            />
          </Field>
          <Field label="Impact">
            <Select
              value={state.impact ?? "MEDIUM"}
              options={LEVELS}
              className="w-full"
              onChange={(impact) => dispatch(actions.setImpact({ impact }))}
            />
          </Field>
          <Field label="Target release">
            <EditableText
              value={state.targetRelease}
              placeholder="e.g. v1.2"
              onCommit={(targetRelease) =>
                dispatch(actions.setTargetRelease({ targetRelease }))
              }
              className="text-sm text-foreground"
            />
          </Field>
        </div>
        <Field label="Notes">
          <EditableText
            value={state.notes}
            placeholder="Notes (optional)"
            multiline
            onCommit={(notes) => dispatch(actions.setNotes({ notes }))}
            className="text-sm text-muted-foreground"
          />
        </Field>
      </Card>
    </Section>
  );
}

/** Outcome targets — the Problem Sheet outcomes this bet aims to move. */
export function TargetsSection({
  state,
  dispatch,
}: {
  state: FeatureState;
  dispatch: Dispatch;
}) {
  return (
    <Section
      title="Outcome Targets"
      action={
        <OutcomeTargetAdder
          onAdd={(t) =>
            dispatch(
              actions.addOutcomeTarget({
                id: generateId(),
                outcomeDocumentId: t.documentId,
                outcomeObjectId: t.objectId,
                outcomeStatement: t.statement || undefined,
              }),
            )
          }
        />
      }
    >
      {state.targets.length === 0 ? (
        <EmptyHint>No outcome targets.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-2">
          {state.targets.map((target) => (
            <TargetRow key={target.id} target={target} dispatch={dispatch} />
          ))}
        </div>
      )}
    </Section>
  );
}

function TargetRow({
  target,
  dispatch,
}: {
  target: OutcomeTarget;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
      <span className="min-w-40 flex-1 text-sm text-foreground">
        {target.outcome.statement || target.outcome.objectId}
      </span>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Δimp
        <EditableNumber
          value={target.expectedImportanceChange}
          onCommit={(expectedImportanceChange) =>
            dispatch(
              actions.updateOutcomeTarget({
                id: target.id,
                expectedImportanceChange,
              }),
            )
          }
          className="w-14"
        />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        Δsat
        <EditableNumber
          value={target.expectedSatisfactionChange}
          onCommit={(expectedSatisfactionChange) =>
            dispatch(
              actions.updateOutcomeTarget({
                id: target.id,
                expectedSatisfactionChange,
              }),
            )
          }
          className="w-14"
        />
      </label>
      <RemoveButton
        onClick={() => dispatch(actions.removeOutcomeTarget({ id: target.id }))}
      />
    </div>
  );
}

/** Segments served — cached references to Audience Sheet segments. */
export function SegmentsSection({
  state,
  dispatch,
}: {
  state: FeatureState;
  dispatch: Dispatch;
}) {
  return (
    <Section
      title="Segments Served"
      action={
        <SegmentRefAdder
          onAdd={(s) =>
            dispatch(
              actions.addSegmentRef({
                id: generateId(),
                documentId: s.documentId,
                objectId: s.objectId,
                name: s.name || undefined,
              }),
            )
          }
        />
      }
    >
      {state.segments.length === 0 ? (
        <EmptyHint>No segments linked.</EmptyHint>
      ) : (
        <div className="flex flex-wrap gap-2">
          {state.segments.map((segment) => (
            <SegmentChip
              key={segment.id}
              segment={segment}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </Section>
  );
}

function SegmentChip({
  segment,
  dispatch,
}: {
  segment: SegmentRef;
  dispatch: Dispatch;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-sm text-foreground">
      {segment.name || segment.objectId}
      <button
        type="button"
        aria-label="Remove segment"
        onClick={() => dispatch(actions.removeSegmentRef({ id: segment.id }))}
        className="text-muted-foreground hover:text-destructive"
      >
        ×
      </button>
    </span>
  );
}

/** Evidence backing the bet. */
export function EvidenceSection({
  state,
  dispatch,
}: {
  state: FeatureState;
  dispatch: Dispatch;
}) {
  return (
    <Section
      title="Evidence"
      action={
        <EvidenceAdder
          onAdd={({ content, source }) =>
            dispatch(actions.addEvidence({ id: generateId(), content, source }))
          }
        />
      }
    >
      {state.evidence.length === 0 ? (
        <EmptyHint>No evidence yet.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {state.evidence.map((ev) => (
            <EvidenceRow key={ev.id} evidence={ev} dispatch={dispatch} />
          ))}
        </div>
      )}
    </Section>
  );
}

function EvidenceRow({
  evidence,
  dispatch,
}: {
  evidence: Evidence;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-start gap-2">
      <Select
        value={evidence.source}
        options={SOURCES}
        onChange={(source) =>
          dispatch(actions.updateEvidence({ id: evidence.id, source }))
        }
      />
      <EditableText
        value={evidence.content}
        placeholder="Evidence"
        required
        multiline
        width="min-w-0 flex-1"
        onCommit={(content) =>
          dispatch(actions.updateEvidence({ id: evidence.id, content }))
        }
        className="text-sm text-foreground"
      />
      <RemoveButton
        onClick={() => dispatch(actions.removeEvidence({ id: evidence.id }))}
      />
    </div>
  );
}

// --- inline cross-document adders -----------------------------------------

function OutcomeTargetAdder({
  onAdd,
}: {
  onAdd: (input: {
    statement: string;
    documentId: string;
    objectId: string;
  }) => void;
}) {
  return (
    <RefForm
      label="target"
      withStatement
      onAdd={({ text, documentId, objectId }) =>
        onAdd({ statement: text, documentId, objectId })
      }
    />
  );
}

function SegmentRefAdder({
  onAdd,
}: {
  onAdd: (input: {
    name: string;
    documentId: string;
    objectId: string;
  }) => void;
}) {
  return (
    <RefForm
      label="segment"
      onAdd={({ text, documentId, objectId }) =>
        onAdd({ name: text, documentId, objectId })
      }
    />
  );
}

/** Inline form for a cross-document reference (label/statement + ids). */
function RefForm({
  label,
  withStatement = false,
  onAdd,
}: {
  label: string;
  withStatement?: boolean;
  onAdd: (input: {
    text: string;
    documentId: string;
    objectId: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [objectId, setObjectId] = useState("");

  if (!open)
    return (
      <LinkButton onClick={() => setOpen(true)}>{`Add ${label}`}</LinkButton>
    );

  const commit = () => {
    if (!documentId.trim() || !objectId.trim()) return;
    onAdd({
      text: text.trim(),
      documentId: documentId.trim(),
      objectId: objectId.trim(),
    });
    setOpen(false);
    setText("");
    setDocumentId("");
    setObjectId("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <input
        value={text}
        placeholder={withStatement ? "statement" : "name"}
        onChange={(e) => setText(e.target.value)}
        className="w-40 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <input
        value={documentId}
        placeholder="document id"
        onChange={(e) => setDocumentId(e.target.value)}
        className="w-36 rounded-sm border border-border px-1.5 py-0.5 font-mono outline-none focus:border-muted-foreground"
      />
      <input
        value={objectId}
        placeholder="object id"
        onChange={(e) => setObjectId(e.target.value)}
        className="w-24 rounded-sm border border-border px-1.5 py-0.5 font-mono outline-none focus:border-muted-foreground"
      />
      <LinkButton onClick={commit}>Add</LinkButton>
      <LinkButton onClick={() => setOpen(false)}>Cancel</LinkButton>
    </div>
  );
}

function EvidenceAdder({
  onAdd,
}: {
  onAdd: (input: { content: string; source: EvidenceSource }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState("");
  const [source, setSource] = useState<EvidenceSource>("BUILDER");

  if (!open)
    return <LinkButton onClick={() => setOpen(true)}>Add evidence</LinkButton>;

  const commit = () => {
    if (!content.trim()) return;
    onAdd({ content: content.trim(), source });
    setOpen(false);
    setContent("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <input
        value={content}
        placeholder="evidence"
        onChange={(e) => setContent(e.target.value)}
        className="w-56 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <Select value={source} options={SOURCES} onChange={setSource} />
      <LinkButton onClick={commit}>Add</LinkButton>
      <LinkButton onClick={() => setOpen(false)}>Cancel</LinkButton>
    </div>
  );
}
