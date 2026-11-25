import type { DocumentDispatch } from "@powerhousedao/reactor-browser";
import { generateId } from "document-model";
import { actions } from "document-models/audience-sheet";
import type {
  AudienceSheetAction,
  Evidence,
  EvidenceSource,
  OutcomePriority,
  RoleRef,
  Segment,
} from "document-models/audience-sheet";
import { useState } from "react";
import {
  AddButton,
  Card,
  EditableNumber,
  EditableText,
  EmptyHint,
  LinkButton,
  Pill,
  RemoveButton,
  Section,
  Select,
  titleCase,
} from "../../shared/fields.js";

type Dispatch = DocumentDispatch<AudienceSheetAction>;

const SOURCES: EvidenceSource[] = ["BUILDER", "AI_SIMULATION", "USER_RESEARCH"];

/** Segments — the market segments the product targets. */
export function SegmentsSection({
  segments,
  dispatch,
}: {
  segments: Segment[];
  dispatch: Dispatch;
}) {
  const add = () =>
    dispatch(actions.addSegment({ id: generateId(), name: "New segment" }));
  return (
    <Section
      title="Segments"
      action={<AddButton onClick={add}>Add segment</AddButton>}
    >
      {segments.length === 0 ? (
        <EmptyHint>No segments yet.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-5">
          {segments.map((segment) => (
            <SegmentCard
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

function SegmentCard({
  segment,
  dispatch,
}: {
  segment: Segment;
  dispatch: Dispatch;
}) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <EditableText
            value={segment.name}
            placeholder="Segment name"
            required
            variant="plain"
            onCommit={(name) =>
              dispatch(actions.updateSegment({ id: segment.id, name }))
            }
            className="text-lg font-semibold text-foreground"
          />
          <EditableText
            value={segment.description}
            placeholder="Who is in this segment?"
            multiline
            variant="plain"
            onCommit={(description) =>
              dispatch(actions.updateSegment({ id: segment.id, description }))
            }
            className="text-sm text-muted-foreground"
          />
        </div>
        <RemoveButton
          label="Remove segment"
          onClick={() => dispatch(actions.removeSegment({ id: segment.id }))}
        />
      </div>

      <SegmentRoles segment={segment} dispatch={dispatch} />
      <OutcomePriorities segment={segment} dispatch={dispatch} />
      <SegmentEvidence segment={segment} dispatch={dispatch} />
    </Card>
  );
}

/** Cached references to Problem Sheet roles operating in the segment. */
function SegmentRoles({
  segment,
  dispatch,
}: {
  segment: Segment;
  dispatch: Dispatch;
}) {
  return (
    <SubBlock
      title="Roles"
      adder={
        <RefAdder
          label="role"
          fields={["name"]}
          onAdd={({ name, documentId, objectId }) =>
            dispatch(
              actions.addSegmentRole({
                id: generateId(),
                segmentId: segment.id,
                documentId,
                objectId,
                name,
              }),
            )
          }
        />
      }
    >
      {segment.roles.length === 0 ? (
        <EmptyHint>No roles linked.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {segment.roles.map((role) => (
            <RoleRow
              key={role.id}
              role={role}
              segmentId={segment.id}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </SubBlock>
  );
}

function RoleRow({
  role,
  segmentId,
  dispatch,
}: {
  role: RoleRef;
  segmentId: string;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-center gap-2">
      {role.kind ? <Pill>{titleCase(role.kind)}</Pill> : null}
      <EditableText
        value={role.name}
        placeholder="Role name"
        onCommit={(name) =>
          dispatch(
            actions.updateSegmentRoleSnippet({ id: role.id, segmentId, name }),
          )
        }
        className="flex-1 text-sm text-foreground"
      />
      <RemoveButton
        onClick={() =>
          dispatch(actions.removeSegmentRole({ id: role.id, segmentId }))
        }
      />
    </div>
  );
}

/** Outcome importance/satisfaction scores; opportunity is derived. */
function OutcomePriorities({
  segment,
  dispatch,
}: {
  segment: Segment;
  dispatch: Dispatch;
}) {
  return (
    <SubBlock
      title="Outcome Priorities"
      adder={
        <PriorityAdder
          onAdd={(p) =>
            dispatch(
              actions.addOutcomePriority({
                id: generateId(),
                segmentId: segment.id,
                outcomeDocumentId: p.documentId,
                outcomeObjectId: p.objectId,
                outcomeStatement: p.statement || undefined,
                importance: p.importance,
                satisfaction: p.satisfaction,
                source: p.source,
              }),
            )
          }
        />
      }
    >
      <div className="overflow-hidden rounded-sm border border-border">
        <table className="w-full text-sm">
          <thead className="bg-accent text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-1.5 font-medium">Outcome</th>
              <th className="px-2 py-1.5 font-medium">Imp.</th>
              <th className="px-2 py-1.5 font-medium">Sat.</th>
              <th className="px-2 py-1.5 font-medium">Opp.</th>
              <th className="px-2 py-1.5 font-medium">Source</th>
              <th className="px-2 py-1.5" />
            </tr>
          </thead>
          <tbody>
            {segment.outcomePriorities.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-3 text-sm text-muted-foreground">
                  No outcome priorities scored.
                </td>
              </tr>
            ) : (
              segment.outcomePriorities.map((p) => (
                <PriorityRow
                  key={p.id}
                  priority={p}
                  segmentId={segment.id}
                  dispatch={dispatch}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </SubBlock>
  );
}

function PriorityRow({
  priority,
  segmentId,
  dispatch,
}: {
  priority: OutcomePriority;
  segmentId: string;
  dispatch: Dispatch;
}) {
  return (
    <tr className="border-t border-border/40 align-middle">
      <td className="px-3 py-1.5 text-foreground">
        {priority.outcome.statement || priority.outcome.objectId}
      </td>
      <td className="px-2 py-1.5">
        <EditableNumber
          value={priority.importance}
          min={1}
          max={10}
          onCommit={(importance) =>
            dispatch(
              actions.updateOutcomePriority({
                id: priority.id,
                segmentId,
                importance,
              }),
            )
          }
          className="w-12"
        />
      </td>
      <td className="px-2 py-1.5">
        <EditableNumber
          value={priority.satisfaction}
          min={1}
          max={10}
          onCommit={(satisfaction) =>
            dispatch(
              actions.updateOutcomePriority({
                id: priority.id,
                segmentId,
                satisfaction,
              }),
            )
          }
          className="w-12"
        />
      </td>
      <td className="px-2 py-1.5 text-xs text-muted-foreground">
        {priority.opportunity.toFixed(1)}
      </td>
      <td className="px-2 py-1.5">
        <Select
          value={priority.source}
          options={SOURCES}
          onChange={(source) =>
            dispatch(
              actions.updateOutcomePriority({
                id: priority.id,
                segmentId,
                source,
              }),
            )
          }
        />
      </td>
      <td className="px-2 py-1.5 text-right">
        <RemoveButton
          onClick={() =>
            dispatch(
              actions.removeOutcomePriority({ id: priority.id, segmentId }),
            )
          }
        />
      </td>
    </tr>
  );
}

/** Evidence backing the segment's claims. */
function SegmentEvidence({
  segment,
  dispatch,
}: {
  segment: Segment;
  dispatch: Dispatch;
}) {
  return (
    <SubBlock
      title="Evidence"
      adder={
        <EvidenceAdder
          onAdd={({ content, source }) =>
            dispatch(
              actions.addSegmentEvidence({
                id: generateId(),
                segmentId: segment.id,
                content,
                source,
              }),
            )
          }
        />
      }
    >
      {segment.evidence.length === 0 ? (
        <EmptyHint>No evidence yet.</EmptyHint>
      ) : (
        <div className="flex flex-col gap-1.5">
          {segment.evidence.map((ev) => (
            <EvidenceRow
              key={ev.id}
              evidence={ev}
              segmentId={segment.id}
              dispatch={dispatch}
            />
          ))}
        </div>
      )}
    </SubBlock>
  );
}

function EvidenceRow({
  evidence,
  segmentId,
  dispatch,
}: {
  evidence: Evidence;
  segmentId: string;
  dispatch: Dispatch;
}) {
  return (
    <div className="flex items-center gap-2">
      <Select
        value={evidence.source}
        options={SOURCES}
        onChange={(source) =>
          dispatch(
            actions.updateSegmentEvidence({
              id: evidence.id,
              segmentId,
              source,
            }),
          )
        }
      />
      <EditableText
        value={evidence.content}
        placeholder="Evidence"
        required
        onCommit={(content) =>
          dispatch(
            actions.updateSegmentEvidence({
              id: evidence.id,
              segmentId,
              content,
            }),
          )
        }
        className="flex-1 text-sm text-foreground"
      />
      <RemoveButton
        onClick={() =>
          dispatch(
            actions.removeSegmentEvidence({ id: evidence.id, segmentId }),
          )
        }
      />
    </div>
  );
}

// --- sub-block scaffolding -------------------------------------------------

function SubBlock({
  title,
  adder,
  children,
}: {
  title: string;
  adder: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {title}
        </h5>
        {adder}
      </div>
      {children}
    </div>
  );
}

/** Generic cross-document reference adder: a label plus the required ids. */
function RefAdder({
  label,
  fields,
  onAdd,
}: {
  label: string;
  fields: ("name" | "statement")[];
  onAdd: (input: {
    name: string;
    statement: string;
    documentId: string;
    objectId: string;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [objectId, setObjectId] = useState("");

  if (!open)
    return (
      <AddButton onClick={() => setOpen(true)}>{`Add ${label}`}</AddButton>
    );

  const commit = () => {
    if (!documentId.trim() || !objectId.trim()) return;
    onAdd({
      name,
      statement: name,
      documentId: documentId.trim(),
      objectId: objectId.trim(),
    });
    setOpen(false);
    setName("");
    setDocumentId("");
    setObjectId("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      {fields.includes("name") ? (
        <input
          value={name}
          placeholder="name"
          onChange={(e) => setName(e.target.value)}
          className="w-28 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
        />
      ) : null}
      <input
        value={documentId}
        placeholder="document id"
        onChange={(e) => setDocumentId(e.target.value)}
        className="w-40 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <input
        value={objectId}
        placeholder="object id"
        onChange={(e) => setObjectId(e.target.value)}
        className="w-28 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <LinkButton onClick={commit}>Add</LinkButton>
      <LinkButton onClick={() => setOpen(false)}>Cancel</LinkButton>
    </div>
  );
}

function PriorityAdder({
  onAdd,
}: {
  onAdd: (input: {
    statement: string;
    documentId: string;
    objectId: string;
    importance: number;
    satisfaction: number;
    source: EvidenceSource;
  }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [objectId, setObjectId] = useState("");
  const [importance, setImportance] = useState(5);
  const [satisfaction, setSatisfaction] = useState(5);
  const [source, setSource] = useState<EvidenceSource>("BUILDER");

  if (!open)
    return <AddButton onClick={() => setOpen(true)}>Add priority</AddButton>;

  const commit = () => {
    if (!documentId.trim() || !objectId.trim()) return;
    onAdd({
      statement,
      documentId: documentId.trim(),
      objectId: objectId.trim(),
      importance,
      satisfaction,
      source,
    });
    setOpen(false);
    setStatement("");
    setDocumentId("");
    setObjectId("");
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <input
        value={statement}
        placeholder="outcome statement"
        onChange={(e) => setStatement(e.target.value)}
        className="w-44 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <input
        value={documentId}
        placeholder="document id"
        onChange={(e) => setDocumentId(e.target.value)}
        className="w-36 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <input
        value={objectId}
        placeholder="object id"
        onChange={(e) => setObjectId(e.target.value)}
        className="w-24 rounded-sm border border-border px-1.5 py-0.5 outline-none focus:border-muted-foreground"
      />
      <label className="flex items-center gap-1 text-muted-foreground">
        imp
        <input
          type="number"
          min={1}
          max={10}
          value={importance}
          onChange={(e) => setImportance(Number(e.target.value))}
          className="w-12 rounded-sm border border-border px-1.5 py-0.5 text-right outline-none focus:border-muted-foreground"
        />
      </label>
      <label className="flex items-center gap-1 text-muted-foreground">
        sat
        <input
          type="number"
          min={1}
          max={10}
          value={satisfaction}
          onChange={(e) => setSatisfaction(Number(e.target.value))}
          className="w-12 rounded-sm border border-border px-1.5 py-0.5 text-right outline-none focus:border-muted-foreground"
        />
      </label>
      <Select value={source} options={SOURCES} onChange={setSource} />
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
    return <AddButton onClick={() => setOpen(true)}>Add evidence</AddButton>;

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
