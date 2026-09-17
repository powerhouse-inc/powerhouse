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
            'enum WorkflowStatus {\n  DRAFT\n  ENABLED\n  DISABLED\n  ARCHIVED\n}\n\nenum RunStatus {\n  PENDING\n  RUNNING\n  WAITING\n  SUCCEEDED\n  FAILED\n  CANCELLED\n  PARKED\n}\n\nenum ConcurrencyMode {\n  SINGLETON\n  QUEUE\n  PARALLEL\n}\n\nenum FailureMode {\n  PARK\n  NOTIFY\n  IGNORE\n}\n\nenum BackoffKind {\n  FIXED\n  EXPONENTIAL\n}\n\ntype RetryPolicy {\n  maxAttempts: Int!\n  backoff: BackoffKind!\n  initialDelaySeconds: Int!\n  maxDelaySeconds: Int!\n  "Error classes that are retryable. Everything else fails terminally on attempt 1."\n  retryOn: [String!]!\n}\n\n"Layout only. The runtime ignores it."\ntype Point {\n  x: Float!\n  y: Float!\n}\n\ntype TriggerBinding {\n  id: OID!\n  "Fully-qualified block type, e.g. \'core#schedule\' or \'@acme/connector-imap#imap.newMessage\'."\n  blockType: String!\n  "Connection document id, when the trigger\'s connector requires one."\n  connectionId: PHID\n  "Validated against the trigger\'s configSchema."\n  config: Unknown!\n  "Optional server-side filter applied before a run is started."\n  filter: Unknown\n}\n\ntype WorkflowStep {\n  id: OID!\n  "Author-visible label; unique within the workflow; used in expressions."\n  key: String!\n  name: String!\n  blockType: String!\n  connectionId: PHID\n  config: Unknown!\n  "Per-step override of the workflow default retry policy."\n  retry: RetryPolicy\n  timeoutSeconds: Int\n  "Expression yielding a stable key; two executions with the same key are one side effect."\n  idempotencyKeyExpression: String\n  position: Point\n}\n\ntype WorkflowEdge {\n  id: OID!\n  "Source step id, or the trigger id for the entry edge."\n  from: OID!\n  to: OID!\n  "Named output port of the source step: \'next\', \'true\', \'false\', \'error\', or a case label."\n  port: String!\n  "Optional guard expression; the edge is taken only when it evaluates truthy."\n  condition: String\n}\n\ntype WorkflowVariable {\n  id: OID!\n  "Name used in expressions."\n  key: String!\n  "Default value; the trigger payload can be mapped onto it."\n  value: Unknown\n  description: String\n}\n\ntype WorkflowPolicy {\n  "SINGLETON drops a firing while a run is active; QUEUE serialises; PARALLEL runs concurrently."\n  concurrency: ConcurrencyMode!\n  maxParallelRuns: Int\n  runTimeoutSeconds: Int!\n  "Bounds how long a run may stay suspended on a waitpoint."\n  maxSuspensionDays: Int!\n  defaultRetry: RetryPolicy!\n  "What happens to a run whose steps have all failed terminally."\n  onFailure: FailureMode!\n  retainRunsDays: Int!\n  journalAsDocument: Boolean!\n}\n\ntype WorkflowState {\n  name: String!\n  description: String\n  "Only ENABLED workflows get trigger instances."\n  status: WorkflowStatus!\n  "Monotonic; bumped on every structural edit. A run records the version it executed."\n  version: Int!\n  trigger: TriggerBinding\n  steps: [WorkflowStep!]!\n  edges: [WorkflowEdge!]!\n  variables: [WorkflowVariable!]!\n  policy: WorkflowPolicy!\n  "Denormalised for inspectors; written by the runtime."\n  lastRunAt: DateTime\n  lastRunStatus: RunStatus\n}',
          examples: [],
          initialValue:
            '{\n    "name": "",\n    "description": null,\n    "status": "DRAFT",\n    "version": 0,\n    "trigger": null,\n    "steps": [],\n    "edges": [],\n    "variables": [],\n    "policy": {\n        "concurrency": "QUEUE",\n        "maxParallelRuns": null,\n        "runTimeoutSeconds": 3600,\n        "maxSuspensionDays": 30,\n        "defaultRetry": {\n            "maxAttempts": 1,\n            "backoff": "FIXED",\n            "initialDelaySeconds": 5,\n            "maxDelaySeconds": 300,\n            "retryOn": []\n        },\n        "onFailure": "PARK",\n        "retainRunsDays": 30,\n        "journalAsDocument": false\n    },\n    "lastRunAt": null,\n    "lastRunStatus": null\n}',
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
              errors: [],
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
              description: "Sets or replaces the trigger binding.",
              schema:
                "input SetTriggerInput {\n    id: OID!\n    blockType: String!\n    connectionId: PHID\n    config: Unknown!\n    filter: Unknown\n}",
              template: "Sets or replaces the trigger binding.",
              reducer:
                "state.trigger = {\n    id: action.input.id,\n    blockType: action.input.blockType,\n    connectionId: action.input.connectionId || null,\n    config: action.input.config,\n    filter: action.input.filter ?? null,\n};\nstate.version += 1;",
              errors: [],
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
                "input AddStepRetryPolicyInput {\n    maxAttempts: Int!\n    backoff: BackoffKind!\n    initialDelaySeconds: Int!\n    maxDelaySeconds: Int!\n    retryOn: [String!]!\n}\n\ninput AddStepPositionInput {\n    x: Float!\n    y: Float!\n}\n\ninput AddStepInput {\n    id: OID!\n    key: String!\n    name: String!\n    blockType: String!\n    connectionId: PHID\n    config: Unknown!\n    retry: AddStepRetryPolicyInput\n    timeoutSeconds: Int\n    idempotencyKeyExpression: String\n    position: AddStepPositionInput\n}",
              template: "Adds a step to the workflow graph.",
              reducer:
                'if (state.steps.some((step) => step.id === action.input.id)) {\n    throw new DuplicateStepIdError("A step with this id already exists");\n}\nif (state.steps.some((step) => step.key === action.input.key)) {\n    throw new DuplicateStepKeyError("A step with this key already exists");\n}\nstate.steps.push({\n    id: action.input.id,\n    key: action.input.key,\n    name: action.input.name,\n    blockType: action.input.blockType,\n    connectionId: action.input.connectionId || null,\n    config: action.input.config,\n    retry: action.input.retry ?? null,\n    timeoutSeconds: action.input.timeoutSeconds ?? null,\n    idempotencyKeyExpression: action.input.idempotencyKeyExpression || null,\n    position: action.input.position ?? null,\n});\nstate.version += 1;',
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
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "12b4dad9-4a89-4a94-b2ff-fadbf492f555",
              name: "UPDATE_STEP",
              description: "Updates the provided fields of an existing step.",
              schema:
                "input UpdateStepRetryPolicyInput {\n    maxAttempts: Int!\n    backoff: BackoffKind!\n    initialDelaySeconds: Int!\n    maxDelaySeconds: Int!\n    retryOn: [String!]!\n}\n\ninput UpdateStepPositionInput {\n    x: Float!\n    y: Float!\n}\n\ninput UpdateStepInput {\n    id: OID!\n    key: String\n    name: String\n    blockType: String\n    connectionId: PHID\n    config: Unknown\n    retry: UpdateStepRetryPolicyInput\n    timeoutSeconds: Int\n    idempotencyKeyExpression: String\n    position: UpdateStepPositionInput\n}",
              template: "Updates the provided fields of an existing step.",
              reducer:
                'const step = state.steps.find((step) => step.id === action.input.id);\nif (!step) {\n    throw new StepNotFoundError("Step not found");\n}\nif (action.input.key) {\n    const conflict = state.steps.some(\n        (other) => other.key === action.input.key && other.id !== action.input.id,\n    );\n    if (conflict) {\n        throw new StepKeyConflictError("Another step already uses this key");\n    }\n    step.key = action.input.key;\n}\nif (action.input.name) step.name = action.input.name;\nif (action.input.blockType) step.blockType = action.input.blockType;\nif (action.input.connectionId) step.connectionId = action.input.connectionId;\nif (action.input.config !== undefined && action.input.config !== null) {\n    step.config = action.input.config;\n}\nif (action.input.retry) step.retry = action.input.retry;\nif (action.input.timeoutSeconds !== undefined && action.input.timeoutSeconds !== null) {\n    step.timeoutSeconds = action.input.timeoutSeconds;\n}\nif (action.input.idempotencyKeyExpression) {\n    step.idempotencyKeyExpression = action.input.idempotencyKeyExpression;\n}\nif (action.input.position) step.position = action.input.position;\nstate.version += 1;',
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
              description: "Replaces a step's block configuration.",
              schema:
                "input SetStepConfigInput {\n    id: OID!\n    config: Unknown!\n}",
              template: "Replaces a step's block configuration.",
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
              description: "Creates or updates a variable, keyed by its key.",
              schema:
                "input SetVariableInput {\n    id: OID!\n    key: String!\n    value: Unknown\n    description: String\n}",
              template: "Creates or updates a variable, keyed by its key.",
              reducer:
                "const existing = state.variables.find(\n    (variable) => variable.key === action.input.key,\n);\nif (existing) {\n    existing.value = action.input.value ?? null;\n    if (action.input.description) existing.description = action.input.description;\n} else {\n    state.variables.push({\n        id: action.input.id,\n        key: action.input.key,\n        value: action.input.value ?? null,\n        description: action.input.description || null,\n    });\n}\nstate.version += 1;",
              errors: [],
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
          ],
        },
      ],
      version: 1,
      changeLog: [],
    },
  ],
};
