import type { AudienceSheetSegmentsOperations } from "document-models/audience-sheet/v1";
import type { AudienceSheetGlobalState, Segment } from "../../gen/types.js";
import {
  DuplicateEvidenceIdError,
  DuplicateOutcomePriorityIdError,
  DuplicateSegmentIdError,
  DuplicateSegmentRoleIdError,
  EvidenceNotFoundError,
  OutcomePriorityNotFoundError,
  SegmentNotFoundError,
  SegmentRoleNotFoundError,
} from "../../gen/segments/error.js";
import { insertItem, opportunity, reorderById } from "../reorder.js";

function findSegment(
  state: AudienceSheetGlobalState,
  segmentId: string,
): Segment {
  const segment = state.segments.find((s) => s.id === segmentId);
  if (!segment) {
    throw new SegmentNotFoundError(`Segment ${segmentId} not found.`);
  }
  return segment;
}

export const audienceSheetSegmentsOperations: AudienceSheetSegmentsOperations =
  {
    addSegmentOperation(state, action) {
      if (state.segments.some((s) => s.id === action.input.id)) {
        throw new DuplicateSegmentIdError(
          `Segment ${action.input.id} already exists.`,
        );
      }
      insertItem(
        state.segments,
        {
          id: action.input.id,
          name: action.input.name,
          description: action.input.description ?? null,
          roles: [],
          outcomePriorities: [],
          evidence: [],
        },
        action.input.insertBefore ?? null,
      );
    },
    updateSegmentOperation(state, action) {
      const segment = findSegment(state, action.input.id);
      if (action.input.name) segment.name = action.input.name;
      if (action.input.description)
        segment.description = action.input.description;
    },
    removeSegmentOperation(state, action) {
      const index = state.segments.findIndex((s) => s.id === action.input.id);
      if (index === -1) {
        throw new SegmentNotFoundError(`Segment ${action.input.id} not found.`);
      }
      state.segments.splice(index, 1);
    },
    reorderSegmentsOperation(state, action) {
      for (const id of action.input.ids) {
        if (!state.segments.some((s) => s.id === id)) {
          throw new SegmentNotFoundError(`Segment ${id} not found.`);
        }
      }
      reorderById(
        state.segments,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
    addSegmentRoleOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      if (segment.roles.some((r) => r.id === action.input.id)) {
        throw new DuplicateSegmentRoleIdError(
          `Role reference ${action.input.id} already exists.`,
        );
      }
      insertItem(
        segment.roles,
        {
          id: action.input.id,
          documentId: action.input.documentId,
          objectId: action.input.objectId,
          name: action.input.name ?? null,
          kind: action.input.kind ?? null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updateSegmentRoleSnippetOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const role = segment.roles.find((r) => r.id === action.input.id);
      if (!role) {
        throw new SegmentRoleNotFoundError(
          `Role reference ${action.input.id} not found.`,
        );
      }
      if (action.input.name) role.name = action.input.name;
      if (action.input.kind) role.kind = action.input.kind;
    },
    removeSegmentRoleOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const index = segment.roles.findIndex((r) => r.id === action.input.id);
      if (index === -1) {
        throw new SegmentRoleNotFoundError(
          `Role reference ${action.input.id} not found.`,
        );
      }
      segment.roles.splice(index, 1);
    },
    reorderSegmentRolesOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      for (const id of action.input.ids) {
        if (!segment.roles.some((r) => r.id === id)) {
          throw new SegmentRoleNotFoundError(`Role reference ${id} not found.`);
        }
      }
      reorderById(
        segment.roles,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
    addOutcomePriorityOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      if (segment.outcomePriorities.some((p) => p.id === action.input.id)) {
        throw new DuplicateOutcomePriorityIdError(
          `Outcome priority ${action.input.id} already exists.`,
        );
      }
      insertItem(
        segment.outcomePriorities,
        {
          id: action.input.id,
          outcome: {
            documentId: action.input.outcomeDocumentId,
            objectId: action.input.outcomeObjectId,
            statement: action.input.outcomeStatement ?? null,
            scope: action.input.outcomeScope ?? null,
          },
          importance: action.input.importance,
          satisfaction: action.input.satisfaction,
          opportunity: opportunity(
            action.input.importance,
            action.input.satisfaction,
          ),
          source: action.input.source,
          notes: action.input.notes ?? null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updateOutcomePriorityOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const priority = segment.outcomePriorities.find(
        (p) => p.id === action.input.id,
      );
      if (!priority) {
        throw new OutcomePriorityNotFoundError(
          `Outcome priority ${action.input.id} not found.`,
        );
      }
      if (
        action.input.importance !== undefined &&
        action.input.importance !== null
      ) {
        priority.importance = action.input.importance;
      }
      if (
        action.input.satisfaction !== undefined &&
        action.input.satisfaction !== null
      ) {
        priority.satisfaction = action.input.satisfaction;
      }
      if (action.input.source) priority.source = action.input.source;
      if (action.input.notes) priority.notes = action.input.notes;
      priority.opportunity = opportunity(
        priority.importance,
        priority.satisfaction,
      );
    },
    updateOutcomePrioritySnippetOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const priority = segment.outcomePriorities.find(
        (p) => p.id === action.input.id,
      );
      if (!priority) {
        throw new OutcomePriorityNotFoundError(
          `Outcome priority ${action.input.id} not found.`,
        );
      }
      if (action.input.statement)
        priority.outcome.statement = action.input.statement;
      if (action.input.scope) priority.outcome.scope = action.input.scope;
    },
    removeOutcomePriorityOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const index = segment.outcomePriorities.findIndex(
        (p) => p.id === action.input.id,
      );
      if (index === -1) {
        throw new OutcomePriorityNotFoundError(
          `Outcome priority ${action.input.id} not found.`,
        );
      }
      segment.outcomePriorities.splice(index, 1);
    },
    reorderOutcomePrioritiesOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      for (const id of action.input.ids) {
        if (!segment.outcomePriorities.some((p) => p.id === id)) {
          throw new OutcomePriorityNotFoundError(
            `Outcome priority ${id} not found.`,
          );
        }
      }
      reorderById(
        segment.outcomePriorities,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
    addSegmentEvidenceOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      if (segment.evidence.some((e) => e.id === action.input.id)) {
        throw new DuplicateEvidenceIdError(
          `Evidence ${action.input.id} already exists.`,
        );
      }
      insertItem(
        segment.evidence,
        {
          id: action.input.id,
          source: action.input.source,
          content: action.input.content,
          recordedAt: action.input.recordedAt ?? null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updateSegmentEvidenceOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const evidence = segment.evidence.find((e) => e.id === action.input.id);
      if (!evidence) {
        throw new EvidenceNotFoundError(
          `Evidence ${action.input.id} not found.`,
        );
      }
      if (action.input.source) evidence.source = action.input.source;
      if (action.input.content) evidence.content = action.input.content;
      if (action.input.recordedAt)
        evidence.recordedAt = action.input.recordedAt;
    },
    removeSegmentEvidenceOperation(state, action) {
      const segment = findSegment(state, action.input.segmentId);
      const index = segment.evidence.findIndex((e) => e.id === action.input.id);
      if (index === -1) {
        throw new EvidenceNotFoundError(
          `Evidence ${action.input.id} not found.`,
        );
      }
      segment.evidence.splice(index, 1);
    },
  };
