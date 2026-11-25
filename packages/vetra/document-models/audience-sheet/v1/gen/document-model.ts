import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/audience-sheet",
  name: "Audience Sheet",
  author: {
    name: "Claude",
    website: "https://powerhouse.inc",
  },
  extension: "aus",
  description:
    "The Audience Sheet is used by product builders in Vetra Studio to define the market segments a product targets and how each segment prioritizes the product's outcomes. For each segment the builder records the roles that operate in it (referenced from the Problem Sheet as cached snippets) and scores the Problem Sheet's outcomes by importance and satisfaction (1-10); the opportunity score is derived. Segments and priorities can carry evidence tagged by source (builder, AI simulation, user research). Agents may attach feedback suggestions that the builder accepts or dismisses.\n\nMarket segment is a strategic concept: it does not change what the product does (Problem Sheet) or its identity (Brand Sheet), only who it is for and which outcomes matter most. The same outcome scored very differently across segments is how segments are distinguished.",
  specifications: [
    {
      state: {
        local: {
          schema: "",
          examples: [],
          initialValue: "",
        },
        global: {
          schema:
            "type AudienceSheetState {\n  segments: [Segment!]!\n  agentFeedback: AgentFeedback!\n}\n\ntype Segment {\n  id: OID!\n  name: String!\n  description: String\n  roles: [RoleRef!]!\n  outcomePriorities: [OutcomePriority!]!\n  evidence: [Evidence!]!\n}\n\ntype RoleRef {\n  id: OID!\n  documentId: PHID!\n  objectId: OID!\n  name: String\n  kind: String\n}\n\ntype OutcomePriority {\n  id: OID!\n  outcome: OutcomeRef!\n  importance: Int!\n  satisfaction: Int!\n  opportunity: Float!\n  source: EvidenceSource!\n  notes: String\n}\n\ntype OutcomeRef {\n  documentId: PHID!\n  objectId: OID!\n  statement: String\n  scope: String\n}\n\ntype Evidence {\n  id: OID!\n  source: EvidenceSource!\n  recordedAt: DateTime\n  content: String!\n}\n\nenum EvidenceSource {\n  BUILDER\n  AI_SIMULATION\n  USER_RESEARCH\n}\n\ntype AgentFeedback {\n  readyForFeedback: Boolean!\n  suggestions: [Suggestion!]!\n}\n\ntype Suggestion {\n  id: OID!\n  createdAt: DateTime!\n  agent: String!\n  content: String!\n  resolution: SuggestionResolution\n}\n\ntype SuggestionResolution {\n  resolvedAt: DateTime!\n  decision: SuggestionDecision!\n  comment: String\n  changeApplied: Boolean!\n}\n\nenum SuggestionDecision {\n  ACCEPTED\n  DISMISSED\n}",
          examples: [],
          initialValue:
            '{\n  "segments": [],\n  "agentFeedback": {\n    "readyForFeedback": false,\n    "suggestions": []\n  }\n}',
        },
      },
      modules: [
        {
          id: "mod-segments",
          name: "segments",
          description:
            "Manage segments and their role references, outcome priorities, and evidence.",
          operations: [
            {
              id: "op-add-segment",
              name: "ADD_SEGMENT",
              description: "Add a segment, optionally before another segment.",
              schema:
                "input AddSegmentInput {\n  id: OID!\n  name: String!\n  description: String\n  insertBefore: OID\n}",
              template: "Add a segment, optionally before another segment.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-segment-id",
                  name: "DuplicateSegmentIdError",
                  code: "DUPLICATE_SEGMENT_ID",
                  description: "A segment with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-segment",
              name: "UPDATE_SEGMENT",
              description: "Update a segment's name or description.",
              schema:
                "input UpdateSegmentInput {\n  id: OID!\n  name: String\n  description: String\n}",
              template: "Update a segment's name or description.",
              reducer: "",
              errors: [
                {
                  id: "err-segment-not-found",
                  name: "SegmentNotFoundError",
                  code: "SEGMENT_NOT_FOUND",
                  description: "No segment with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-segment",
              name: "REMOVE_SEGMENT",
              description: "Remove a segment.",
              schema: "input RemoveSegmentInput {\n  id: OID!\n}",
              template: "Remove a segment.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-segments",
              name: "REORDER_SEGMENTS",
              description:
                "Reorder segments by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderSegmentsInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder segments by moving the given ids before an anchor (or to the end when null).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-segment-role",
              name: "ADD_SEGMENT_ROLE",
              description:
                "Add a cached reference to a Problem Sheet role operating in this segment.",
              schema:
                "input AddSegmentRoleInput {\n  segmentId: OID!\n  id: OID!\n  documentId: PHID!\n  objectId: OID!\n  name: String\n  kind: String\n  insertBefore: OID\n}",
              template:
                "Add a cached reference to a Problem Sheet role operating in this segment.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-segment-role-id",
                  name: "DuplicateSegmentRoleIdError",
                  code: "DUPLICATE_SEGMENT_ROLE_ID",
                  description:
                    "A role reference with this id already exists in the segment.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-segment-role-snippet",
              name: "UPDATE_SEGMENT_ROLE_SNIPPET",
              description:
                "Refresh the cached name/kind of a segment's role reference.",
              schema:
                "input UpdateSegmentRoleSnippetInput {\n  segmentId: OID!\n  id: OID!\n  name: String\n  kind: String\n}",
              template:
                "Refresh the cached name/kind of a segment's role reference.",
              reducer: "",
              errors: [
                {
                  id: "err-segment-role-not-found",
                  name: "SegmentRoleNotFoundError",
                  code: "SEGMENT_ROLE_NOT_FOUND",
                  description:
                    "No role reference with the given id was found in the segment.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-segment-role",
              name: "REMOVE_SEGMENT_ROLE",
              description: "Remove a role reference from a segment.",
              schema:
                "input RemoveSegmentRoleInput {\n  segmentId: OID!\n  id: OID!\n}",
              template: "Remove a role reference from a segment.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-segment-roles",
              name: "REORDER_SEGMENT_ROLES",
              description: "Reorder a segment's role references.",
              schema:
                "input ReorderSegmentRolesInput {\n  segmentId: OID!\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template: "Reorder a segment's role references.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-outcome-priority",
              name: "ADD_OUTCOME_PRIORITY",
              description:
                "Add an outcome priority for a segment. Opportunity is derived from importance and satisfaction.",
              schema:
                "input AddOutcomePriorityInput {\n  segmentId: OID!\n  id: OID!\n  outcomeDocumentId: PHID!\n  outcomeObjectId: OID!\n  outcomeStatement: String\n  outcomeScope: String\n  importance: Int!\n  satisfaction: Int!\n  source: EvidenceSource!\n  notes: String\n  insertBefore: OID\n}",
              template:
                "Add an outcome priority for a segment. Opportunity is derived from importance and satisfaction.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-outcome-priority-id",
                  name: "DuplicateOutcomePriorityIdError",
                  code: "DUPLICATE_OUTCOME_PRIORITY_ID",
                  description:
                    "An outcome priority with this id already exists in the segment.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-outcome-priority",
              name: "UPDATE_OUTCOME_PRIORITY",
              description:
                "Update an outcome priority's scores or source. Opportunity is recomputed.",
              schema:
                "input UpdateOutcomePriorityInput {\n  segmentId: OID!\n  id: OID!\n  importance: Int\n  satisfaction: Int\n  source: EvidenceSource\n  notes: String\n}",
              template:
                "Update an outcome priority's scores or source. Opportunity is recomputed.",
              reducer: "",
              errors: [
                {
                  id: "err-outcome-priority-not-found",
                  name: "OutcomePriorityNotFoundError",
                  code: "OUTCOME_PRIORITY_NOT_FOUND",
                  description:
                    "No outcome priority with the given id was found in the segment.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-outcome-priority-snippet",
              name: "UPDATE_OUTCOME_PRIORITY_SNIPPET",
              description:
                "Refresh the cached outcome statement/scope of an outcome priority.",
              schema:
                "input UpdateOutcomePrioritySnippetInput {\n  segmentId: OID!\n  id: OID!\n  statement: String\n  scope: String\n}",
              template:
                "Refresh the cached outcome statement/scope of an outcome priority.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-outcome-priority",
              name: "REMOVE_OUTCOME_PRIORITY",
              description: "Remove an outcome priority from a segment.",
              schema:
                "input RemoveOutcomePriorityInput {\n  segmentId: OID!\n  id: OID!\n}",
              template: "Remove an outcome priority from a segment.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-outcome-priorities",
              name: "REORDER_OUTCOME_PRIORITIES",
              description: "Reorder a segment's outcome priorities.",
              schema:
                "input ReorderOutcomePrioritiesInput {\n  segmentId: OID!\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template: "Reorder a segment's outcome priorities.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-segment-evidence",
              name: "ADD_SEGMENT_EVIDENCE",
              description: "Add a piece of evidence to a segment.",
              schema:
                "input AddSegmentEvidenceInput {\n  segmentId: OID!\n  id: OID!\n  source: EvidenceSource!\n  content: String!\n  recordedAt: DateTime\n  insertBefore: OID\n}",
              template: "Add a piece of evidence to a segment.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-evidence-id",
                  name: "DuplicateEvidenceIdError",
                  code: "DUPLICATE_EVIDENCE_ID",
                  description:
                    "An evidence entry with this id already exists in the segment.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-segment-evidence",
              name: "UPDATE_SEGMENT_EVIDENCE",
              description: "Update a piece of a segment's evidence.",
              schema:
                "input UpdateSegmentEvidenceInput {\n  segmentId: OID!\n  id: OID!\n  source: EvidenceSource\n  content: String\n  recordedAt: DateTime\n}",
              template: "Update a piece of a segment's evidence.",
              reducer: "",
              errors: [
                {
                  id: "err-evidence-not-found",
                  name: "EvidenceNotFoundError",
                  code: "EVIDENCE_NOT_FOUND",
                  description:
                    "No evidence entry with the given id was found in the segment.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-segment-evidence",
              name: "REMOVE_SEGMENT_EVIDENCE",
              description: "Remove a piece of evidence from a segment.",
              schema:
                "input RemoveSegmentEvidenceInput {\n  segmentId: OID!\n  id: OID!\n}",
              template: "Remove a piece of evidence from a segment.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-agent-feedback",
          name: "agent_feedback",
          description:
            "Builder readiness signal and the agent suggestion workflow.",
          operations: [
            {
              id: "op-set-ready-for-feedback",
              name: "SET_READY_FOR_FEEDBACK",
              description:
                "Set whether the document is open to agent feedback.",
              schema: "input SetReadyForFeedbackInput {\n  ready: Boolean!\n}",
              template: "Set whether the document is open to agent feedback.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-suggestion",
              name: "ADD_SUGGESTION",
              description: "Add an agent suggestion.",
              schema:
                "input AddSuggestionInput {\n  id: OID!\n  createdAt: DateTime!\n  agent: String!\n  content: String!\n}",
              template: "Add an agent suggestion.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-suggestion-id",
                  name: "DuplicateSuggestionIdError",
                  code: "DUPLICATE_SUGGESTION_ID",
                  description: "A suggestion with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-resolve-suggestion",
              name: "RESOLVE_SUGGESTION",
              description:
                "Resolve a suggestion (accept or dismiss), optionally with a comment.",
              schema:
                "input ResolveSuggestionInput {\n  id: OID!\n  resolvedAt: DateTime!\n  decision: SuggestionDecision!\n  comment: String\n  changeApplied: Boolean!\n}",
              template:
                "Resolve a suggestion (accept or dismiss), optionally with a comment.",
              reducer: "",
              errors: [
                {
                  id: "err-suggestion-not-found",
                  name: "SuggestionNotFoundError",
                  code: "SUGGESTION_NOT_FOUND",
                  description: "No suggestion with the given id was found.",
                  template: "",
                },
                {
                  id: "err-suggestion-already-resolved",
                  name: "SuggestionAlreadyResolvedError",
                  code: "SUGGESTION_ALREADY_RESOLVED",
                  description: "The suggestion has already been resolved.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-suggestion",
              name: "REMOVE_SUGGESTION",
              description: "Remove a suggestion.",
              schema: "input RemoveSuggestionInput {\n  id: OID!\n}",
              template: "Remove a suggestion.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
