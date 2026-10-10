import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/workflow",
  name: "Workflow",
  author: {
    name: "Powerhouse",
    website: "https://www.powerhouse.inc",
  },
  extension: ".flow",
  description:
    "Workflow definition: trigger, steps, edges, variables and execution policy for the Powerhouse workflow automation runtime.",
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
            'enum WorkflowStatus {\n  DRAFT\n  ENABLED\n  DISABLED\n  ARCHIVED\n}\n\nenum RunStatus {\n  PENDING\n  RUNNING\n  WAITING\n  SUCCEEDED\n  FAILED\n  CANCELLED\n  PARKED\n}\n\nenum ConcurrencyMode {\n  SINGLETON\n  QUEUE\n  PARALLEL\n}\n\nenum FailureMode {\n  PARK\n  NOTIFY\n  IGNORE\n}\n\nenum BackoffKind {\n  FIXED\n  EXPONENTIAL\n}\n\ntype RetryPolicy {\n  "Attempts, not retries: 1 is no retry. Clamped to 10 by the runtime, since each attempt re-runs a side effect and holds the run\'s worker slot."\n  maxAttempts: Int!\n  backoff: BackoffKind!\n  initialDelaySeconds: Int!\n  maxDelaySeconds: Int!\n  "Error classes that are retryable, matched against the error\'s class name or anywhere in its message, case-insensitively. EMPTY admits every error: an empty list with maxAttempts > 1 means retry, not never-retry."\n  retryOn: [String!]!\n}\n\nenum PropertyMode {\n  "The field\'s own control."\n  MANUAL\n  "The author switched the field to a free {{\u2026}} expression."\n  EXPRESSION\n}\n\ntype PropertySetting {\n  prop: String!\n  mode: PropertyMode!\n  "Resolved DynamicProperties children, options stripped."\n  schema: Unknown\n}\n\n"Reference to the latest test run in the run store."\ntype StepTestRecord {\n  runId: String!\n  testedAt: DateTime!\n}\n\n"Layout only. The runtime ignores it."\ntype Point {\n  x: Float!\n  y: Float!\n}\n\ntype TriggerBinding {\n  id: OID!\n  "Package name of the trigger\'s piece, e.g. \'@powerhousedao/piece-core\' or \'@acme/piece-imap\'."\n  pieceName: String!\n  "Exact semver of the piece, e.g. \'1.2.0\'."\n  pieceVersion: String!\n  "Trigger name within the piece, e.g. \'schedule\' or \'new_message\'."\n  triggerName: String!\n  "Connection document id, when the trigger\'s connector requires one."\n  connectionId: PHID\n  "Reactor connection document id, when the trigger declares requireReactor."\n  reactorConnectionId: PHID\n  "Validated against the trigger\'s configSchema."\n  config: Unknown!\n  propertySettings: [PropertySetting!]\n  lastTest: StepTestRecord\n  "Timestamp of the last real edit; a lastTest before it is stale."\n  updatedAt: DateTime\n}\n\ntype WorkflowStep {\n  id: OID!\n  "Author-visible label; unique within the workflow; used in expressions."\n  key: String!\n  name: String!\n  "Package name of the step\'s piece, e.g. \'@powerhousedao/piece-core\' or \'@activepieces/piece-http\'."\n  pieceName: String!\n  "Exact semver of the piece, e.g. \'0.11.19\'."\n  pieceVersion: String!\n  "Action name within the piece, e.g. \'branch\' or \'send_request\'."\n  actionName: String!\n  connectionId: PHID\n  "Reactor connection document id, when the action declares requireReactor."\n  reactorConnectionId: PHID\n  config: Unknown!\n  "ENFORCED. Per-step override of the workflow default retry policy."\n  retry: RetryPolicy\n  "ENFORCED. Also raises the cap on each host call the step\'s piece makes, which is never shorter than the step\'s own timeout."\n  timeoutSeconds: Int\n  "NOT YET ENFORCED. Expression yielding a stable key; two executions with the same key are one side effect. A fire is deduplicated on its trigger operation or a trigger item\'s _dedupe_key, never on a step expression."\n  idempotencyKeyExpression: String\n  position: Point\n  propertySettings: [PropertySetting!]\n  lastTest: StepTestRecord\n  "Skipped steps are passed over at run time."\n  skip: Boolean\n  "Timestamp of the last real edit; a lastTest before it is stale."\n  updatedAt: DateTime\n}\n\ntype WorkflowEdge {\n  id: OID!\n  "Source step id, or the trigger id for the entry edge."\n  from: OID!\n  to: OID!\n  "Output port of the source, one it declares: \'next\' and \'error\' for a piece action, \'next\' for the trigger, \'true\', \'false\' and \'error\' for a branch."\n  port: String!\n  "Optional guard expression; the edge is taken only when it evaluates truthy."\n  condition: String\n}\n\nenum VariableType {\n  TEXT\n  NUMBER\n  BOOLEAN\n  JSON\n  "value is a secret-provider handle (the format of a connection SecretRef.ref), never the plaintext."\n  SECRET\n}\n\ntype WorkflowVariable {\n  id: OID!\n  "Name used in expressions."\n  key: String!\n  "The value a run reads as variables.<key>."\n  value: Unknown\n  description: String\n  "Null means untyped; consumers infer the kind of value it holds."\n  type: VariableType\n}\n\ntype WorkflowPolicy {\n  "ENFORCED. SINGLETON drops a firing while a run is active (journaled CANCELLED, not dropped silently); QUEUE serialises; PARALLEL runs concurrently."\n  concurrency: ConcurrencyMode!\n  "ENFORCED under PARALLEL: how many runs of this workflow may execute at once; null is unbounded. SINGLETON and QUEUE are 1 by definition."\n  maxParallelRuns: Int\n  "ENFORCED. Checked between steps and while a retry waits; past it the run ends CANCELLED."\n  runTimeoutSeconds: Int!\n  "NOT YET ENFORCED. Bounds how long a run may stay suspended on a waitpoint - but nothing suspends: waitpoints, run.pause and generateResumeUrl all throw, so there is no suspended state to bound."\n  maxSuspensionDays: Int!\n  "ENFORCED. The fallback for a step with no retry of its own."\n  defaultRetry: RetryPolicy!\n  "ENFORCED. What happens to a run whose steps have all failed terminally: PARK takes the trigger out of the supervisor\'s ENABLED set until the workflow is re-published or re-enabled, NOTIFY logs at error level (the only notification channel this engine has), IGNORE does nothing."\n  onFailure: FailureMode!\n  "NOT YET ENFORCED per workflow. Retention is a journal-wide sweep on the relational handle, which has no reactor read to resolve a per-workflow window with; PH_WORKFLOWS_RUN_RETENTION_DAYS (30 days by default) is the control that applies."\n  retainRunsDays: Int!\n  "NOT YET ENFORCED. The run journal is relational; there is no run document model to write."\n  journalAsDocument: Boolean!\n}\n\n"Snapshot of the draft taken by PUBLISH_WORKFLOW."\ntype PublishedWorkflow {\n  "Draft version the snapshot was taken at."\n  version: Int!\n  publishedAt: DateTime!\n  trigger: TriggerBinding\n  steps: [WorkflowStep!]!\n  edges: [WorkflowEdge!]!\n  variables: [WorkflowVariable!]!\n  policy: WorkflowPolicy!\n}\n\ntype WorkflowState {\n  name: String!\n  description: String\n  "Only ENABLED workflows get trigger instances."\n  status: WorkflowStatus!\n  "Bumped on every draft edit; REVERT_TO_PUBLISHED resets it to published.version. A run records the version it executed."\n  version: Int!\n  trigger: TriggerBinding\n  steps: [WorkflowStep!]!\n  edges: [WorkflowEdge!]!\n  variables: [WorkflowVariable!]!\n  policy: WorkflowPolicy!\n  "Last published snapshot; version !== published.version means unpublished changes."\n  published: PublishedWorkflow\n  "Denormalised for inspectors; written by the runtime."\n  lastRunAt: DateTime\n  lastRunStatus: RunStatus\n}',
          examples: [],
          initialValue:
            '{\n    "name": "",\n    "description": null,\n    "status": "DRAFT",\n    "version": 0,\n    "trigger": null,\n    "steps": [],\n    "edges": [],\n    "variables": [],\n    "policy": {\n        "concurrency": "QUEUE",\n        "maxParallelRuns": null,\n        "runTimeoutSeconds": 3600,\n        "maxSuspensionDays": 30,\n        "defaultRetry": {\n            "maxAttempts": 1,\n            "backoff": "FIXED",\n            "initialDelaySeconds": 5,\n            "maxDelaySeconds": 300,\n            "retryOn": []\n        },\n        "onFailure": "PARK",\n        "retainRunsDays": 30,\n        "journalAsDocument": false\n    },\n    "published": null,\n    "lastRunAt": null,\n    "lastRunStatus": null\n}',
        },
      },
      modules: [
        {
          id: "2bcbeac5-6a42-4dd7-ad9a-a11401acfa67",
          name: "workflow",
          description: "Workflow identity and lifecycle status.",
          operations: [
            {
              id: "63c4df18-df11-4f17-8afa-69da90129dd9",
              name: "SET_WORKFLOW_NAME",
              description: "Sets the workflow name.",
              schema: "input SetWorkflowNameInput {\n    name: String!\n}",
              template: "Sets the workflow name.",
              reducer: "state.name = action.input.name;",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "2875c3ae-6fc6-4ebb-9274-6f8318227945",
              name: "SET_WORKFLOW_DESCRIPTION",
              description: "Sets or clears the workflow description.",
              schema:
                "input SetWorkflowDescriptionInput {\n    description: String\n}",
              template: "Sets or clears the workflow description.",
              reducer: "state.description = action.input.description || null;",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "6b4f8fb2-db70-4707-985d-47cff171dbec",
              name: "SET_WORKFLOW_STATUS",
              description:
                "Sets the lifecycle status. The trigger supervisor watches this to create or tear down trigger instances.",
              schema:
                "input SetWorkflowStatusInput {\n    status: WorkflowStatus!\n}",
              template:
                "Sets the lifecycle status. The trigger supervisor watches this to create or tear down trigger instances.",
              reducer: "state.status = action.input.status;",
              errors: [
                {
                  id: "ceb06c52-61b3-4c92-826f-9d2f87fb64d6",
                  name: "WorkflowNotPublishedError",
                  code: "WORKFLOW_NOT_PUBLISHED",
                  description:
                    "ENABLED needs a published snapshot; publish the workflow first.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "e1dc35a8-a050-4773-a6a2-6b41f0a6210c",
          name: "trigger",
          description: "Binding of the workflow's single trigger.",
          operations: [
            {
              id: "f1f2ac35-7d6f-4b2c-b1a4-f220f290fdad",
              name: "SET_TRIGGER",
              description:
                "Sets or replaces the trigger binding. Omitted propertySettings and lastTest carry over when the id, piece, version and trigger name are unchanged.",
              schema:
                "input SetTriggerPropertySettingInput {\n    prop: String!\n    mode: PropertyMode!\n    schema: Unknown\n}\n\ninput SetTriggerInput {\n    id: OID!\n    pieceName: String!\n    pieceVersion: String!\n    triggerName: String!\n    connectionId: PHID\n    reactorConnectionId: PHID\n    config: Unknown!\n    propertySettings: [SetTriggerPropertySettingInput!]\n}",
              template:
                "Sets or replaces the trigger binding. Omitted propertySettings and lastTest carry over when the id, piece, version and trigger name are unchanged.",
              reducer:
                "state.trigger = {\n    id: action.input.id,\n    pieceName: action.input.pieceName,\n    pieceVersion: action.input.pieceVersion,\n    triggerName: action.input.triggerName,\n    connectionId: action.input.connectionId || null,\n    config: action.input.config,\n    filter: action.input.filter ?? null,\n};\nstate.version += 1;",
              errors: [
                {
                  id: "2191e673-e5b7-4e27-921d-3534f95fc095",
                  name: "InvalidTriggerBlockError",
                  code: "INVALID_TRIGGER_BLOCK",
                  description:
                    "The trigger names no piece or trigger, or its piece version is not an exact semver.",
                  template: "",
                },
                {
                  id: "cf3fced2-61c0-41a1-a0de-664ee00b2e25",
                  name: "TriggerConfigNotObjectError",
                  code: "TRIGGER_CONFIG_NOT_OBJECT",
                  description: "The trigger's config is not a JSON object.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "351e16a9-78c3-4466-a25f-e8b09eb0b956",
              name: "CLEAR_TRIGGER",
              description: "Removes the trigger binding.",
              schema: "input ClearTriggerInput {\n    _: Boolean\n}",
              template: "Removes the trigger binding.",
              reducer:
                'if (!state.trigger) {\n    throw new TriggerNotSetError("Workflow has no trigger to clear");\n}\nstate.trigger = null;\nstate.version += 1;',
              errors: [
                {
                  id: "fe485734-5e01-4af9-aaa9-adcc45e3160a",
                  name: "TriggerNotSetError",
                  code: "TRIGGER_NOT_SET",
                  description: "The workflow has no trigger binding to clear.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "e3c8b542-657d-44b9-ad8c-472f8e01dbbf",
          name: "steps",
          description: "Step instances of blocks in the workflow graph.",
          operations: [
            {
              id: "d71c412f-9c48-4c1d-9d5b-f7c3cd18cecc",
              name: "ADD_STEP",
              description: "Adds a step to the workflow graph.",
              schema:
                "input AddStepRetryPolicyInput {\n    maxAttempts: Int!\n    backoff: BackoffKind!\n    initialDelaySeconds: Int!\n    maxDelaySeconds: Int!\n    retryOn: [String!]!\n}\n\ninput AddStepPositionInput {\n    x: Float!\n    y: Float!\n}\n\ninput AddStepPropertySettingInput {\n    prop: String!\n    mode: PropertyMode!\n    schema: Unknown\n}\n\ninput AddStepInput {\n    id: OID!\n    key: String!\n    name: String!\n    pieceName: String!\n    pieceVersion: String!\n    actionName: String!\n    connectionId: PHID\n    reactorConnectionId: PHID\n    config: Unknown!\n    retry: AddStepRetryPolicyInput\n    timeoutSeconds: Int\n    idempotencyKeyExpression: String\n    position: AddStepPositionInput\n    skip: Boolean\n    propertySettings: [AddStepPropertySettingInput!]\n}",
              template: "Adds a step to the workflow graph.",
              reducer:
                'if (state.steps.some((step) => step.id === action.input.id)) {\n    throw new DuplicateStepIdError("A step with this id already exists");\n}\nif (state.steps.some((step) => step.key === action.input.key)) {\n    throw new DuplicateStepKeyError("A step with this key already exists");\n}\nstate.steps.push({\n    id: action.input.id,\n    key: action.input.key,\n    name: action.input.name,\n    pieceName: action.input.pieceName,\n    pieceVersion: action.input.pieceVersion,\n    actionName: action.input.actionName,\n    connectionId: action.input.connectionId || null,\n    config: action.input.config,\n    retry: action.input.retry ?? null,\n    timeoutSeconds: action.input.timeoutSeconds ?? null,\n    idempotencyKeyExpression: action.input.idempotencyKeyExpression || null,\n    position: action.input.position ?? null,\n});\nstate.version += 1;',
              errors: [
                {
                  id: "9f42bbac-54a9-42bc-b6e6-86f158d1a474",
                  name: "DuplicateStepIdError",
                  code: "DUPLICATE_STEP_ID",
                  description: "A step with the given id already exists.",
                  template: "",
                },
                {
                  id: "e9ef62ad-2b63-43f7-ac25-b0ab81f833c5",
                  name: "DuplicateStepKeyError",
                  code: "DUPLICATE_STEP_KEY",
                  description: "A step with the given key already exists.",
                  template: "",
                },
                {
                  id: "62bbe509-cb42-47b4-92a9-9f407cee5128",
                  name: "InvalidStepBlockError",
                  code: "INVALID_STEP_BLOCK",
                  description:
                    "The step names no piece or action, or its piece version is not an exact semver.",
                  template: "",
                },
                {
                  id: "a802cfa8-43e7-4d4d-a1eb-13f6406dde63",
                  name: "StepConfigNotObjectError",
                  code: "STEP_CONFIG_NOT_OBJECT",
                  description: "The new step's config is not a JSON object.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "12b4dad9-4a89-4a94-b2ff-fadbf492f555",
              name: "UPDATE_STEP",
              description: "Updates the provided fields of an existing step.",
              schema:
                "input UpdateStepRetryPolicyInput {\n    maxAttempts: Int!\n    backoff: BackoffKind!\n    initialDelaySeconds: Int!\n    maxDelaySeconds: Int!\n    retryOn: [String!]!\n}\n\ninput UpdateStepPositionInput {\n    x: Float!\n    y: Float!\n}\n\ninput UpdateStepInput {\n    id: OID!\n    key: String\n    name: String\n    pieceName: String\n    pieceVersion: String\n    actionName: String\n    connectionId: PHID\n    reactorConnectionId: PHID\n    config: Unknown\n    retry: UpdateStepRetryPolicyInput\n    timeoutSeconds: Int\n    idempotencyKeyExpression: String\n    position: UpdateStepPositionInput\n    skip: Boolean\n}",
              template: "Updates the provided fields of an existing step.",
              reducer:
                'const step = state.steps.find((step) => step.id === action.input.id);\nif (!step) {\n    throw new StepNotFoundError("Step not found");\n}\nif (action.input.key) {\n    const conflict = state.steps.some(\n        (other) => other.key === action.input.key && other.id !== action.input.id,\n    );\n    if (conflict) {\n        throw new StepKeyConflictError("Another step already uses this key");\n    }\n    step.key = action.input.key;\n}\nif (action.input.name) step.name = action.input.name;\nif (action.input.pieceName) step.pieceName = action.input.pieceName;\nif (action.input.pieceVersion) step.pieceVersion = action.input.pieceVersion;\nif (action.input.actionName) step.actionName = action.input.actionName;\nif (action.input.connectionId) step.connectionId = action.input.connectionId;\nif (action.input.config !== undefined && action.input.config !== null) {\n    step.config = action.input.config;\n}\n// For the optional runtime fields null clears; undefined leaves as is.\nif (action.input.retry !== undefined) {\n    step.retry = action.input.retry ?? null;\n}\nif (action.input.timeoutSeconds !== undefined) {\n    step.timeoutSeconds = action.input.timeoutSeconds ?? null;\n}\nif (action.input.idempotencyKeyExpression !== undefined) {\n    step.idempotencyKeyExpression = action.input.idempotencyKeyExpression || null;\n}\nif (action.input.position) step.position = action.input.position;\nstate.version += 1;',
              errors: [
                {
                  id: "2f3f0a0b-555a-4350-86b4-5e7e86de8b8a",
                  name: "StepNotFoundError",
                  code: "STEP_NOT_FOUND",
                  description: "No step exists with the given id.",
                  template: "",
                },
                {
                  id: "74f45aaf-68ae-49a9-bd3c-d1e5a50b0ea3",
                  name: "StepKeyConflictError",
                  code: "STEP_KEY_CONFLICT",
                  description: "Another step already uses the given key.",
                  template: "",
                },
                {
                  id: "3db35060-c54a-445d-9202-3613bf90c8f4",
                  name: "InvalidUpdateBlockError",
                  code: "INVALID_UPDATE_BLOCK",
                  description:
                    "The update leaves the step with no piece or action, or with a piece version that is not an exact semver.",
                  template: "",
                },
                {
                  id: "3841fa5a-d989-43d0-90fa-dfb224f3c463",
                  name: "UpdateConfigNotObjectError",
                  code: "UPDATE_CONFIG_NOT_OBJECT",
                  description: "The step's new config is not a JSON object.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "d01c89ca-3934-43b5-9540-9e45b415c772",
              name: "REMOVE_STEP",
              description: "Removes a step and every edge attached to it.",
              schema: "input RemoveStepInput {\n    id: OID!\n}",
              template: "Removes a step and every edge attached to it.",
              reducer:
                'const index = state.steps.findIndex((step) => step.id === action.input.id);\nif (index === -1) {\n    throw new RemoveStepNotFoundError("Step not found");\n}\nstate.steps.splice(index, 1);\nstate.edges = state.edges.filter(\n    (edge) => edge.from !== action.input.id && edge.to !== action.input.id,\n);\nstate.version += 1;',
              errors: [
                {
                  id: "2bc5f26f-975b-46a0-9df9-1dbac5bbd6eb",
                  name: "RemoveStepNotFoundError",
                  code: "REMOVE_STEP_NOT_FOUND",
                  description: "No step exists with the given id.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "c83eb80e-8086-40e5-b8ed-fe3f72b664a6",
              name: "SET_STEP_CONFIG",
              description:
                "Replaces a step's block configuration, and optionally its property settings.",
              schema:
                "input SetStepConfigPropertySettingInput {\n    prop: String!\n    mode: PropertyMode!\n    schema: Unknown\n}\n\ninput SetStepConfigInput {\n    id: OID!\n    config: Unknown!\n    propertySettings: [SetStepConfigPropertySettingInput!]\n}",
              template:
                "Replaces a step's block configuration, and optionally its property settings.",
              reducer:
                'const step = state.steps.find((step) => step.id === action.input.id);\nif (!step) {\n    throw new ConfigStepNotFoundError("Step not found");\n}\nstep.config = action.input.config;\nstate.version += 1;',
              errors: [
                {
                  id: "8ba30ce9-510e-4765-9955-23b4d76595ab",
                  name: "ConfigStepNotFoundError",
                  code: "CONFIG_STEP_NOT_FOUND",
                  description: "No step exists with the given id.",
                  template: "",
                },
                {
                  id: "f6d05410-a1a8-4cab-8d7c-ea14506aa479",
                  name: "SetConfigNotObjectError",
                  code: "SET_CONFIG_NOT_OBJECT",
                  description: "The step's config is not a JSON object.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "5f6223ad-23d1-4e2c-9680-8fd91234d785",
          name: "edges",
          description: "Directed edges between steps (and from the trigger).",
          operations: [
            {
              id: "293bcd32-7c85-42c9-846a-8c4ecde33154",
              name: "ADD_EDGE",
              description:
                "Adds an edge. The source may be a step or the trigger; the target must be a step.",
              schema:
                "input AddEdgeInput {\n    id: OID!\n    from: OID!\n    to: OID!\n    port: String!\n    condition: String\n}",
              template:
                "Adds an edge. The source may be a step or the trigger; the target must be a step.",
              reducer:
                'if (state.edges.some((edge) => edge.id === action.input.id)) {\n    throw new DuplicateEdgeIdError("An edge with this id already exists");\n}\nconst fromExists =\n    state.steps.some((step) => step.id === action.input.from) ||\n    state.trigger?.id === action.input.from;\nif (!fromExists) {\n    throw new EdgeSourceNotFoundError("Edge source step or trigger not found");\n}\nif (!state.steps.some((step) => step.id === action.input.to)) {\n    throw new EdgeTargetNotFoundError("Edge target step not found");\n}\nif (wouldCycle(state.edges, action.input.from, action.input.to)) {\n    throw new EdgeCycleError("Edge would create a cycle in the workflow graph");\n}\nstate.edges.push({\n    id: action.input.id,\n    from: action.input.from,\n    to: action.input.to,\n    port: action.input.port,\n    condition: action.input.condition || null,\n});\nstate.version += 1;',
              errors: [
                {
                  id: "aa22b9b5-bbd7-4d80-b6b6-573c5f761ed7",
                  name: "DuplicateEdgeIdError",
                  code: "DUPLICATE_EDGE_ID",
                  description: "An edge with the given id already exists.",
                  template: "",
                },
                {
                  id: "5207d810-062d-4b83-82e3-e3f89d905a83",
                  name: "EdgeSourceNotFoundError",
                  code: "EDGE_SOURCE_NOT_FOUND",
                  description:
                    "The edge source references no existing step or trigger.",
                  template: "",
                },
                {
                  id: "39149b92-84b9-4429-a631-4d7e1981270c",
                  name: "EdgeTargetNotFoundError",
                  code: "EDGE_TARGET_NOT_FOUND",
                  description: "The edge target references no existing step.",
                  template: "",
                },
                {
                  id: "6e4a5f2b-3c7d-4e19-9a2b-8d0c1f5e7a6b",
                  name: "EdgeCycleError",
                  code: "EDGE_CYCLE",
                  description:
                    "The edge would create a cycle in the workflow graph.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "ba545d3b-796d-4af3-b4c6-016401a691ff",
              name: "REMOVE_EDGE",
              description: "Removes an edge.",
              schema: "input RemoveEdgeInput {\n    id: OID!\n}",
              template: "Removes an edge.",
              reducer:
                'const index = state.edges.findIndex((edge) => edge.id === action.input.id);\nif (index === -1) {\n    throw new EdgeNotFoundError("Edge not found");\n}\nstate.edges.splice(index, 1);\nstate.version += 1;',
              errors: [
                {
                  id: "b7e2ffa4-7775-460d-aae8-0d82dce5ffcf",
                  name: "EdgeNotFoundError",
                  code: "EDGE_NOT_FOUND",
                  description: "No edge exists with the given id.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "c003c578-94fd-40d1-8964-ea151ee56486",
          name: "variables",
          description: "Workflow-level inputs and defaults.",
          operations: [
            {
              id: "50745ece-569a-4d49-b649-8ec2de3dd2d9",
              name: "SET_VARIABLE",
              description:
                "Creates the variable with this id, or updates it (its key included). Keys are unique.",
              schema:
                'input SetVariableInput {\n    id: OID!\n    key: String!\n    value: Unknown\n    description: String\n    "Undefined leaves an existing variable\'s type unchanged; null clears it."\n    type: VariableType\n}',
              template: "Creates or updates a variable, keyed by its key.",
              reducer:
                "const existing = state.variables.find(\n    (variable) => variable.key === action.input.key,\n);\nif (existing) {\n    existing.value = action.input.value ?? null;\n    if (action.input.description) existing.description = action.input.description;\n} else {\n    state.variables.push({\n        id: action.input.id,\n        key: action.input.key,\n        value: action.input.value ?? null,\n        description: action.input.description || null,\n    });\n}\nstate.version += 1;",
              errors: [
                {
                  id: "50fa86ce-2616-47d3-9e9a-225c63efc08c",
                  name: "SecretVariableValueError",
                  code: "SECRET_VARIABLE_VALUE",
                  description:
                    "A SECRET variable's value must be a secret reference string or null.",
                  template: "",
                },
                {
                  id: "868842e4-3df4-4e62-9b98-adf70cd1acbb",
                  name: "DuplicateVariableKeyError",
                  code: "DUPLICATE_VARIABLE_KEY",
                  description: "Another variable already uses the given key.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "d85b2b0a-085b-482e-a4be-401fa7e5faa2",
              name: "REMOVE_VARIABLE",
              description: "Removes a variable.",
              schema: "input RemoveVariableInput {\n    id: OID!\n}",
              template: "Removes a variable.",
              reducer:
                'const index = state.variables.findIndex(\n    (variable) => variable.id === action.input.id,\n);\nif (index === -1) {\n    throw new VariableNotFoundError("Variable not found");\n}\nstate.variables.splice(index, 1);\nstate.version += 1;',
              errors: [
                {
                  id: "2b1913d2-6490-48f5-8bdb-5ec8e062c855",
                  name: "VariableNotFoundError",
                  code: "VARIABLE_NOT_FOUND",
                  description: "No variable exists with the given id.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "956e2432-13b1-417a-b932-4286082ef7d4",
          name: "policy",
          description: "Execution policy for runs of this workflow.",
          operations: [
            {
              id: "e0a331e7-a4b0-4b93-8af7-d25e602932b8",
              name: "SET_POLICY",
              description:
                "Updates the provided fields of the execution policy.",
              schema:
                "input SetPolicyRetryPolicyInput {\n    maxAttempts: Int!\n    backoff: BackoffKind!\n    initialDelaySeconds: Int!\n    maxDelaySeconds: Int!\n    retryOn: [String!]!\n}\n\ninput SetPolicyInput {\n    concurrency: ConcurrencyMode\n    maxParallelRuns: Int\n    runTimeoutSeconds: Int\n    maxSuspensionDays: Int\n    defaultRetry: SetPolicyRetryPolicyInput\n    onFailure: FailureMode\n    retainRunsDays: Int\n    journalAsDocument: Boolean\n}",
              template: "Updates the provided fields of the execution policy.",
              reducer:
                "if (action.input.concurrency) state.policy.concurrency = action.input.concurrency;\nif (action.input.maxParallelRuns !== undefined && action.input.maxParallelRuns !== null) {\n    state.policy.maxParallelRuns = action.input.maxParallelRuns;\n}\nif (action.input.runTimeoutSeconds !== undefined && action.input.runTimeoutSeconds !== null) {\n    state.policy.runTimeoutSeconds = action.input.runTimeoutSeconds;\n}\nif (action.input.maxSuspensionDays !== undefined && action.input.maxSuspensionDays !== null) {\n    state.policy.maxSuspensionDays = action.input.maxSuspensionDays;\n}\nif (action.input.defaultRetry) state.policy.defaultRetry = action.input.defaultRetry;\nif (action.input.onFailure) state.policy.onFailure = action.input.onFailure;\nif (action.input.retainRunsDays !== undefined && action.input.retainRunsDays !== null) {\n    state.policy.retainRunsDays = action.input.retainRunsDays;\n}\nif (action.input.journalAsDocument !== undefined && action.input.journalAsDocument !== null) {\n    state.policy.journalAsDocument = action.input.journalAsDocument;\n}\nstate.version += 1;",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "4c4656ac-62bb-498a-9a64-567a8e09ac09",
          name: "runtime",
          description: "Denormalised run info written by the workflow runtime.",
          operations: [
            {
              id: "cdaf7978-b846-4c3e-ae30-c5d87eac66a4",
              name: "SET_LAST_RUN",
              description: "Records the outcome of the most recent run.",
              schema:
                "input SetLastRunInput {\n    lastRunAt: DateTime!\n    lastRunStatus: RunStatus!\n}",
              template: "Records the outcome of the most recent run.",
              reducer:
                "state.lastRunAt = action.input.lastRunAt;\nstate.lastRunStatus = action.input.lastRunStatus;",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "a370b78b-53b6-4344-9a92-a600d8eda77e",
              name: "SET_LAST_TEST",
              description:
                "Records the latest test run of a step or the trigger. Does not bump version.",
              schema:
                'input SetLastTestInput {\n    "Step id or trigger id."\n    id: OID!\n    runId: String!\n    testedAt: DateTime!\n}',
              template:
                "Records the latest test run of a step or the trigger. Does not bump version.",
              reducer: "",
              errors: [
                {
                  id: "53f18e15-1623-4cd0-8be4-44d4286d5eab",
                  name: "LastTestTargetNotFoundError",
                  code: "LAST_TEST_TARGET_NOT_FOUND",
                  description: "No step or trigger exists with the given id.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "d08ad3f2-8985-4b36-baae-4b870407bba8",
          name: "publishing",
          description: "Draft versus published snapshot of the workflow.",
          operations: [
            {
              id: "a0cc29cc-259a-4bc8-814d-0847883700eb",
              name: "PUBLISH_WORKFLOW",
              description:
                "Snapshots the draft trigger, steps, edges, variables and policy into published at the current version.",
              schema:
                "input PublishWorkflowInput {\n    publishedAt: DateTime!\n}",
              template:
                "Snapshots the draft trigger, steps, edges, variables and policy into published at the current version.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "b4642462-2652-4a6e-a6ba-8e299d830d92",
              name: "REVERT_TO_PUBLISHED",
              description:
                "Replaces the draft with the published snapshot and resets version to published.version.",
              schema: "input RevertToPublishedInput {\n    _: Boolean\n}",
              template:
                "Replaces the draft with the published snapshot and resets version to published.version.",
              reducer: "",
              errors: [
                {
                  id: "f0056b3a-549d-4063-b8e5-2978279168e7",
                  name: "NothingPublishedError",
                  code: "NOTHING_PUBLISHED",
                  description: "The workflow has never been published.",
                  template: "",
                },
              ],
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
