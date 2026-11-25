import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/problem-sheet",
  name: "Problem Sheet",
  author: {
    name: "Claude",
    website: "https://powerhouse.inc",
  },
  extension: "prs",
  description:
    "The Problem Sheet is used by product builders in Vetra Studio to define the universal problem a product solves. The builder records the single core functional job as an Outcome-Driven Innovation job statement (motivation, verb, object, clarifier), the optional job steps drawn from ODI's universal job map, the roles that execute or support the job (primary roles may carry a specialized job), the measurable outcomes that define success (scoped CORE, SPECIALIZED, or OPERATIONAL), and the constraints that limit execution. Agents may attach feedback suggestions that the builder accepts or dismisses.\n\nThe Problem Sheet is deliberately segment-agnostic: outcome importance and satisfaction scores are not stored here \u2014 they live on the Audience Sheet, scored per segment. It does not hold positioning or visual identity (Brand Sheet) or proposed changes (Feature). It is the stable, universal definition of what the product does.",
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
            "type ProblemSheetState {\n  context: String\n  coreJob: JobStatement\n  coreJobSteps: [JobStep!]!\n  roles: [Role!]!\n  outcomes: [Outcome!]!\n  constraints: [Constraint!]!\n  agentFeedback: AgentFeedback!\n}\n\ntype JobStatement {\n  motivation: Motivation!\n  verb: String!\n  object: String!\n  clarifier: String\n}\n\nenum Motivation {\n  LOVE_TO\n  WANT_TO\n  NEED_TO\n  HAVE_TO\n  HATE_TO\n  CANNOT\n}\n\ntype JobStep {\n  id: OID!\n  name: String!\n  category: JobMapStep!\n  description: String\n}\n\nenum JobMapStep {\n  DEFINE\n  LOCATE\n  PREPARE\n  CONFIRM\n  EXECUTE\n  MONITOR\n  MODIFY\n  CONCLUDE\n}\n\ntype Role {\n  id: OID!\n  name: String!\n  description: String\n  context: String\n  kind: RoleKind!\n  specializedJob: SpecializedJob\n}\n\nenum RoleKind {\n  PRIMARY\n  SUPPORT\n}\n\ntype SpecializedJob {\n  motivation: Motivation!\n  verb: String!\n  object: String!\n  clarifier: String\n  steps: [JobStep!]!\n}\n\ntype Outcome {\n  id: OID!\n  direction: OutcomeDirection!\n  metric: String\n  object: String!\n  clarifier: String\n  scope: OutcomeScope!\n  role: OID\n  relatedStep: OID\n  notes: String\n}\n\nenum OutcomeDirection {\n  INCREASE\n  DECREASE\n  SATISFY\n  AVOID\n}\n\nenum OutcomeScope {\n  CORE\n  SPECIALIZED\n  OPERATIONAL\n}\n\ntype Constraint {\n  id: OID!\n  description: String!\n  severity: Severity!\n  notes: String\n}\n\nenum Severity {\n  LOW\n  MEDIUM\n  HIGH\n}\n\ntype AgentFeedback {\n  readyForFeedback: Boolean!\n  suggestions: [Suggestion!]!\n}\n\ntype Suggestion {\n  id: OID!\n  createdAt: DateTime!\n  agent: String!\n  content: String!\n  resolution: SuggestionResolution\n}\n\ntype SuggestionResolution {\n  resolvedAt: DateTime!\n  decision: SuggestionDecision!\n  comment: String\n  changeApplied: Boolean!\n}\n\nenum SuggestionDecision {\n  ACCEPTED\n  DISMISSED\n}",
          examples: [],
          initialValue:
            '{\n  "context": null,\n  "coreJob": null,\n  "coreJobSteps": [],\n  "roles": [],\n  "outcomes": [],\n  "constraints": [],\n  "agentFeedback": {\n    "readyForFeedback": false,\n    "suggestions": []\n  }\n}',
        },
      },
      modules: [
        {
          id: "mod-context",
          name: "context",
          description: "Set and clear the freeform context narrative.",
          operations: [
            {
              id: "op-set-context",
              name: "SET_CONTEXT",
              description: "Set the freeform context narrative.",
              schema: "input SetContextInput {\n  context: String!\n}",
              template: "Set the freeform context narrative.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-context",
              name: "CLEAR_CONTEXT",
              description: "Clear the context narrative.",
              schema: "input ClearContextInput {\n  _: Boolean\n}",
              template: "Clear the context narrative.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-core-job",
          name: "core_job",
          description:
            "Define, refine, and clear the single core functional job statement.",
          operations: [
            {
              id: "op-set-core-job",
              name: "SET_CORE_JOB",
              description:
                "Set the core job statement, replacing any existing one.",
              schema:
                "input SetCoreJobInput {\n  motivation: Motivation!\n  verb: String!\n  object: String!\n  clarifier: String\n}",
              template:
                "Set the core job statement, replacing any existing one.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-core-job",
              name: "UPDATE_CORE_JOB",
              description: "Update fields of the existing core job statement.",
              schema:
                "input UpdateCoreJobInput {\n  motivation: Motivation\n  verb: String\n  object: String\n  clarifier: String\n}",
              template: "Update fields of the existing core job statement.",
              reducer: "",
              errors: [
                {
                  id: "err-core-job-not-set",
                  name: "CoreJobNotSetError",
                  code: "CORE_JOB_NOT_SET",
                  description: "No core job statement exists to update.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-core-job",
              name: "CLEAR_CORE_JOB",
              description: "Clear the core job statement (a pivot).",
              schema: "input ClearCoreJobInput {\n  _: Boolean\n}",
              template: "Clear the core job statement (a pivot).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-job-steps",
          name: "job_steps",
          description: "Manage the ordered steps of the core job.",
          operations: [
            {
              id: "op-add-job-step",
              name: "ADD_JOB_STEP",
              description:
                "Add a step to the core job, optionally before another step.",
              schema:
                "input AddJobStepInput {\n  id: OID!\n  name: String!\n  category: JobMapStep!\n  description: String\n  insertBefore: OID\n}",
              template:
                "Add a step to the core job, optionally before another step.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-job-step-id",
                  name: "DuplicateJobStepIdError",
                  code: "DUPLICATE_JOB_STEP_ID",
                  description: "A job step with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-job-step",
              name: "UPDATE_JOB_STEP",
              description: "Update a core job step.",
              schema:
                "input UpdateJobStepInput {\n  id: OID!\n  name: String\n  category: JobMapStep\n  description: String\n}",
              template: "Update a core job step.",
              reducer: "",
              errors: [
                {
                  id: "err-job-step-not-found",
                  name: "JobStepNotFoundError",
                  code: "JOB_STEP_NOT_FOUND",
                  description: "No job step with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-job-step",
              name: "REMOVE_JOB_STEP",
              description: "Remove a core job step.",
              schema: "input RemoveJobStepInput {\n  id: OID!\n}",
              template: "Remove a core job step.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-job-steps",
              name: "REORDER_JOB_STEPS",
              description:
                "Reorder core job steps by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderJobStepsInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder core job steps by moving the given ids before an anchor (or to the end when null).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-roles",
          name: "roles",
          description:
            "Manage roles and their optional specialized jobs and steps.",
          operations: [
            {
              id: "op-add-role",
              name: "ADD_ROLE",
              description: "Add a role, optionally before another role.",
              schema:
                "input AddRoleInput {\n  id: OID!\n  name: String!\n  kind: RoleKind!\n  description: String\n  context: String\n  insertBefore: OID\n}",
              template: "Add a role, optionally before another role.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-role-id",
                  name: "DuplicateRoleIdError",
                  code: "DUPLICATE_ROLE_ID",
                  description: "A role with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-role",
              name: "UPDATE_ROLE",
              description: "Update a role's fields.",
              schema:
                "input UpdateRoleInput {\n  id: OID!\n  name: String\n  kind: RoleKind\n  description: String\n  context: String\n}",
              template: "Update a role's fields.",
              reducer: "",
              errors: [
                {
                  id: "err-role-not-found",
                  name: "RoleNotFoundError",
                  code: "ROLE_NOT_FOUND",
                  description: "No role with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-role",
              name: "REMOVE_ROLE",
              description: "Remove a role.",
              schema: "input RemoveRoleInput {\n  id: OID!\n}",
              template: "Remove a role.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-roles",
              name: "REORDER_ROLES",
              description:
                "Reorder roles by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderRolesInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder roles by moving the given ids before an anchor (or to the end when null).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-set-role-specialized-job",
              name: "SET_ROLE_SPECIALIZED_JOB",
              description:
                "Set (or replace) a role's specialized job. Intended for PRIMARY roles.",
              schema:
                "input SetRoleSpecializedJobInput {\n  roleId: OID!\n  motivation: Motivation!\n  verb: String!\n  object: String!\n  clarifier: String\n}",
              template:
                "Set (or replace) a role's specialized job. Intended for PRIMARY roles.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-role-specialized-job",
              name: "UPDATE_ROLE_SPECIALIZED_JOB",
              description:
                "Update fields of a role's specialized job statement.",
              schema:
                "input UpdateRoleSpecializedJobInput {\n  roleId: OID!\n  motivation: Motivation\n  verb: String\n  object: String\n  clarifier: String\n}",
              template: "Update fields of a role's specialized job statement.",
              reducer: "",
              errors: [
                {
                  id: "err-specialized-job-not-set",
                  name: "SpecializedJobNotSetError",
                  code: "SPECIALIZED_JOB_NOT_SET",
                  description: "The role has no specialized job to operate on.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-role-specialized-job",
              name: "CLEAR_ROLE_SPECIALIZED_JOB",
              description: "Clear a role's specialized job.",
              schema: "input ClearRoleSpecializedJobInput {\n  roleId: OID!\n}",
              template: "Clear a role's specialized job.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-specialized-job-step",
              name: "ADD_SPECIALIZED_JOB_STEP",
              description:
                "Add a step to a role's specialized job, optionally before another step.",
              schema:
                "input AddSpecializedJobStepInput {\n  roleId: OID!\n  id: OID!\n  name: String!\n  category: JobMapStep!\n  description: String\n  insertBefore: OID\n}",
              template:
                "Add a step to a role's specialized job, optionally before another step.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-specialized-job-step-id",
                  name: "DuplicateSpecializedJobStepIdError",
                  code: "DUPLICATE_SPECIALIZED_JOB_STEP_ID",
                  description:
                    "A step with this id already exists in the role's specialized job.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-specialized-job-step",
              name: "UPDATE_SPECIALIZED_JOB_STEP",
              description: "Update a step of a role's specialized job.",
              schema:
                "input UpdateSpecializedJobStepInput {\n  roleId: OID!\n  id: OID!\n  name: String\n  category: JobMapStep\n  description: String\n}",
              template: "Update a step of a role's specialized job.",
              reducer: "",
              errors: [
                {
                  id: "err-specialized-job-step-not-found",
                  name: "SpecializedJobStepNotFoundError",
                  code: "SPECIALIZED_JOB_STEP_NOT_FOUND",
                  description:
                    "No step with the given id was found in the role's specialized job.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-specialized-job-step",
              name: "REMOVE_SPECIALIZED_JOB_STEP",
              description: "Remove a step from a role's specialized job.",
              schema:
                "input RemoveSpecializedJobStepInput {\n  roleId: OID!\n  id: OID!\n}",
              template: "Remove a step from a role's specialized job.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-specialized-job-steps",
              name: "REORDER_SPECIALIZED_JOB_STEPS",
              description: "Reorder a role's specialized job steps.",
              schema:
                "input ReorderSpecializedJobStepsInput {\n  roleId: OID!\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template: "Reorder a role's specialized job steps.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-outcomes",
          name: "outcomes",
          description: "Manage the universal, segment-agnostic outcome list.",
          operations: [
            {
              id: "op-add-outcome",
              name: "ADD_OUTCOME",
              description: "Add an outcome, optionally before another outcome.",
              schema:
                "input AddOutcomeInput {\n  id: OID!\n  direction: OutcomeDirection!\n  object: String!\n  scope: OutcomeScope!\n  metric: String\n  clarifier: String\n  role: OID\n  relatedStep: OID\n  notes: String\n  insertBefore: OID\n}",
              template: "Add an outcome, optionally before another outcome.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-outcome-id",
                  name: "DuplicateOutcomeIdError",
                  code: "DUPLICATE_OUTCOME_ID",
                  description: "An outcome with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-outcome",
              name: "UPDATE_OUTCOME",
              description: "Update an outcome's fields.",
              schema:
                "input UpdateOutcomeInput {\n  id: OID!\n  direction: OutcomeDirection\n  object: String\n  scope: OutcomeScope\n  metric: String\n  clarifier: String\n  role: OID\n  relatedStep: OID\n  notes: String\n}",
              template: "Update an outcome's fields.",
              reducer: "",
              errors: [
                {
                  id: "err-outcome-not-found",
                  name: "OutcomeNotFoundError",
                  code: "OUTCOME_NOT_FOUND",
                  description: "No outcome with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-outcome",
              name: "REMOVE_OUTCOME",
              description: "Remove an outcome.",
              schema: "input RemoveOutcomeInput {\n  id: OID!\n}",
              template: "Remove an outcome.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-outcomes",
              name: "REORDER_OUTCOMES",
              description:
                "Reorder outcomes by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderOutcomesInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder outcomes by moving the given ids before an anchor (or to the end when null).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-outcome-metric",
              name: "CLEAR_OUTCOME_METRIC",
              description: "Clear an outcome's metric.",
              schema: "input ClearOutcomeMetricInput {\n  id: OID!\n}",
              template: "Clear an outcome's metric.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-outcome-role",
              name: "CLEAR_OUTCOME_ROLE",
              description: "Clear an outcome's role reference.",
              schema: "input ClearOutcomeRoleInput {\n  id: OID!\n}",
              template: "Clear an outcome's role reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-outcome-step",
              name: "CLEAR_OUTCOME_STEP",
              description: "Clear an outcome's related-step reference.",
              schema: "input ClearOutcomeStepInput {\n  id: OID!\n}",
              template: "Clear an outcome's related-step reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-constraints",
          name: "constraints",
          description: "Manage environmental constraints on the job.",
          operations: [
            {
              id: "op-add-constraint",
              name: "ADD_CONSTRAINT",
              description:
                "Add a constraint, optionally before another constraint.",
              schema:
                "input AddConstraintInput {\n  id: OID!\n  description: String!\n  severity: Severity!\n  notes: String\n  insertBefore: OID\n}",
              template:
                "Add a constraint, optionally before another constraint.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-constraint-id",
                  name: "DuplicateConstraintIdError",
                  code: "DUPLICATE_CONSTRAINT_ID",
                  description: "A constraint with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-constraint",
              name: "UPDATE_CONSTRAINT",
              description: "Update a constraint's fields.",
              schema:
                "input UpdateConstraintInput {\n  id: OID!\n  description: String\n  severity: Severity\n  notes: String\n}",
              template: "Update a constraint's fields.",
              reducer: "",
              errors: [
                {
                  id: "err-constraint-not-found",
                  name: "ConstraintNotFoundError",
                  code: "CONSTRAINT_NOT_FOUND",
                  description: "No constraint with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-constraint",
              name: "REMOVE_CONSTRAINT",
              description: "Remove a constraint.",
              schema: "input RemoveConstraintInput {\n  id: OID!\n}",
              template: "Remove a constraint.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-constraints",
              name: "REORDER_CONSTRAINTS",
              description:
                "Reorder constraints by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderConstraintsInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder constraints by moving the given ids before an anchor (or to the end when null).",
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
