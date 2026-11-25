import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/work-breakdown-structure",
  name: "Work Breakdown Structure",
  author: {
    name: "Claude",
    website: "https://powerhouse.inc",
  },
  extension: "wbs",
  description:
    "The Work Breakdown Structure is used by planner agents and builders in Vetra Studio to decompose a Feature into executable Tasks. It is two-way linked to its Feature (a cached snippet) and holds a flat, ordered list of work packages (each optionally nested one level via parentPackageId) and a flat, ordered list of atomic Tasks (each assigned to a package via packageId, or unscoped when null). A Task carries its kind(s), an optional target specification, contributing outcome references, acceptance criteria, owner, the agent sessions that planned and execute it, hard dependencies on other tasks (which may live in other WBS documents), and lifecycle timestamps. Cross-document references are stored as refreshable snippets.\n\nNamed transitions carry the invariants: the WBS moves DRAFT to ACTIVE to COMPLETE (only when every task is done or dropped), with an ARCHIVED off-ramp; each Task moves through TODO, IN_PROGRESS, REVIEW, DONE with BLOCKED and DROPPED side paths. Task dependencies form a set; the studio rejects cycles among tasks within the same document.",
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
            "type WorkBreakdownStructureState {\n  feature: FeatureRef\n  name: String\n  description: String\n  packages: [WorkPackage!]!\n  tasks: [Task!]!\n  status: WbsStatus!\n}\n\ntype WorkPackage {\n  id: OID!\n  parentPackageId: OID\n  name: String!\n  description: String\n}\n\ntype Task {\n  id: OID!\n  packageId: OID\n  name: String!\n  description: String\n  taskKind: [TaskKind!]!\n  targetSpec: SpecRef\n  targetOutcomes: [OutcomeRef!]!\n  acceptanceCriteria: String\n  status: TaskStatus!\n  owner: String\n  session: SessionRef\n  plannedIn: SessionRef\n  dependsOn: [TaskRef!]!\n  parentFeature: FeatureRef\n  startedAt: DateTime\n  completedAt: DateTime\n  notes: String\n}\n\ntype FeatureRef {\n  documentId: PHID!\n  name: String\n  status: String\n}\n\ntype SpecRef {\n  documentId: PHID!\n  name: String\n  kind: String\n}\n\ntype OutcomeRef {\n  id: OID!\n  documentId: PHID!\n  objectId: OID!\n  statement: String\n  scope: String\n}\n\ntype SessionRef {\n  documentId: PHID!\n  agent: String\n  model: String\n}\n\ntype TaskRef {\n  id: OID!\n  documentId: PHID!\n  objectId: OID!\n  name: String\n  status: String\n}\n\nenum WbsStatus {\n  DRAFT\n  ACTIVE\n  COMPLETE\n  ARCHIVED\n}\n\nenum TaskKind {\n  SPEC_CHANGE\n  IMPLEMENTATION\n  INTEGRATION\n  TESTING\n  REVIEW\n  DOCUMENTATION\n  MAINTENANCE\n}\n\nenum TaskStatus {\n  TODO\n  IN_PROGRESS\n  REVIEW\n  DONE\n  BLOCKED\n  DROPPED\n}",
          examples: [],
          initialValue:
            '{\n  "feature": null,\n  "name": null,\n  "description": null,\n  "packages": [],\n  "tasks": [],\n  "status": "DRAFT"\n}',
        },
      },
      modules: [
        {
          id: "mod-wbs-meta",
          name: "wbs_meta",
          description:
            "Set the WBS name, description, and cached Feature reference.",
          operations: [
            {
              id: "op-set-wbs-name",
              name: "SET_WBS_NAME",
              description: "Set the WBS name.",
              schema: "input SetWbsNameInput {\n  name: String!\n}",
              template: "Set the WBS name.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-wbs-name",
              name: "CLEAR_WBS_NAME",
              description: "Clear the WBS name.",
              schema: "input ClearWbsNameInput {\n  _: Boolean\n}",
              template: "Clear the WBS name.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-set-wbs-description",
              name: "SET_WBS_DESCRIPTION",
              description: "Set the WBS description.",
              schema:
                "input SetWbsDescriptionInput {\n  description: String!\n}",
              template: "Set the WBS description.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-wbs-description",
              name: "CLEAR_WBS_DESCRIPTION",
              description: "Clear the WBS description.",
              schema: "input ClearWbsDescriptionInput {\n  _: Boolean\n}",
              template: "Clear the WBS description.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-set-feature",
              name: "SET_FEATURE",
              description:
                "Set the cached Feature reference this WBS breaks down.",
              schema:
                "input SetFeatureInput {\n  documentId: PHID!\n  name: String\n  status: String\n}",
              template:
                "Set the cached Feature reference this WBS breaks down.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-feature-snippet",
              name: "UPDATE_FEATURE_SNIPPET",
              description: "Refresh the cached Feature name/status.",
              schema:
                "input UpdateFeatureSnippetInput {\n  name: String\n  status: String\n}",
              template: "Refresh the cached Feature name/status.",
              reducer: "",
              errors: [
                {
                  id: "err-feature-not-set",
                  name: "FeatureNotSetError",
                  code: "FEATURE_NOT_SET",
                  description: "No Feature reference is set to refresh.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-feature",
              name: "CLEAR_FEATURE",
              description: "Clear the Feature reference.",
              schema: "input ClearFeatureInput {\n  _: Boolean\n}",
              template: "Clear the Feature reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-wbs-status",
          name: "wbs_status",
          description: "Named WBS planning-status transitions.",
          operations: [
            {
              id: "op-activate-wbs",
              name: "ACTIVATE_WBS",
              description: "Move the WBS from DRAFT to ACTIVE.",
              schema: "input ActivateWbsInput {\n  _: Boolean\n}",
              template: "Move the WBS from DRAFT to ACTIVE.",
              reducer: "",
              errors: [
                {
                  id: "err-invalid-wbs-transition",
                  name: "InvalidWbsTransitionError",
                  code: "INVALID_WBS_TRANSITION",
                  description:
                    "The requested WBS status transition is not allowed from the current status.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-complete-wbs",
              name: "COMPLETE_WBS",
              description:
                "Move an ACTIVE WBS to COMPLETE; requires all tasks DONE or DROPPED.",
              schema: "input CompleteWbsInput {\n  _: Boolean\n}",
              template:
                "Move an ACTIVE WBS to COMPLETE; requires all tasks DONE or DROPPED.",
              reducer: "",
              errors: [
                {
                  id: "err-tasks-not-complete",
                  name: "TasksNotCompleteError",
                  code: "TASKS_NOT_COMPLETE",
                  description:
                    "The WBS cannot be completed while tasks remain that are not DONE or DROPPED.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-archive-wbs",
              name: "ARCHIVE_WBS",
              description: "Archive the WBS.",
              schema: "input ArchiveWbsInput {\n  _: Boolean\n}",
              template: "Archive the WBS.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reopen-wbs",
              name: "REOPEN_WBS",
              description: "Reopen a COMPLETE or ARCHIVED WBS to ACTIVE.",
              schema: "input ReopenWbsInput {\n  _: Boolean\n}",
              template: "Reopen a COMPLETE or ARCHIVED WBS to ACTIVE.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-packages",
          name: "packages",
          description:
            "Manage the flat list of work packages (one level of nesting via parentPackageId).",
          operations: [
            {
              id: "op-add-package",
              name: "ADD_PACKAGE",
              description:
                "Add a work package, optionally nested under a parent and before an anchor.",
              schema:
                "input AddPackageInput {\n  id: OID!\n  name: String!\n  description: String\n  parentPackageId: OID\n  insertBefore: OID\n}",
              template:
                "Add a work package, optionally nested under a parent and before an anchor.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-package-id",
                  name: "DuplicatePackageIdError",
                  code: "DUPLICATE_PACKAGE_ID",
                  description: "A package with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-package",
              name: "UPDATE_PACKAGE",
              description: "Update a package's name or description.",
              schema:
                "input UpdatePackageInput {\n  id: OID!\n  name: String\n  description: String\n}",
              template: "Update a package's name or description.",
              reducer: "",
              errors: [
                {
                  id: "err-package-not-found",
                  name: "PackageNotFoundError",
                  code: "PACKAGE_NOT_FOUND",
                  description: "No package with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-move-package",
              name: "MOVE_PACKAGE",
              description:
                "Reparent a package (null parent = top level). At most one level of nesting.",
              schema:
                "input MovePackageInput {\n  id: OID!\n  parentPackageId: OID\n}",
              template:
                "Reparent a package (null parent = top level). At most one level of nesting.",
              reducer: "",
              errors: [
                {
                  id: "err-package-nesting-too-deep",
                  name: "PackageNestingTooDeepError",
                  code: "PACKAGE_NESTING_TOO_DEEP",
                  description: "Packages may nest at most one level deep.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-package",
              name: "REMOVE_PACKAGE",
              description:
                "Remove a package; its tasks become unscoped and its child packages become top-level.",
              schema: "input RemovePackageInput {\n  id: OID!\n}",
              template:
                "Remove a package; its tasks become unscoped and its child packages become top-level.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-packages",
              name: "REORDER_PACKAGES",
              description:
                "Reorder packages by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderPackagesInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder packages by moving the given ids before an anchor (or to the end when null).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "mod-tasks",
          name: "tasks",
          description:
            "Manage tasks: CRUD, placement, cross-document references, dependencies, and lifecycle transitions.",
          operations: [
            {
              id: "op-add-task",
              name: "ADD_TASK",
              description:
                "Add a task (status defaults TODO), optionally in a package and before an anchor.",
              schema:
                "input AddTaskInput {\n  id: OID!\n  name: String!\n  taskKind: [TaskKind!]!\n  packageId: OID\n  description: String\n  acceptanceCriteria: String\n  owner: String\n  insertBefore: OID\n}",
              template:
                "Add a task (status defaults TODO), optionally in a package and before an anchor.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-task-id",
                  name: "DuplicateTaskIdError",
                  code: "DUPLICATE_TASK_ID",
                  description: "A task with this id already exists.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task",
              name: "UPDATE_TASK",
              description: "Update a task's editable fields.",
              schema:
                "input UpdateTaskInput {\n  id: OID!\n  name: String\n  description: String\n  taskKind: [TaskKind!]\n  acceptanceCriteria: String\n  owner: String\n  notes: String\n}",
              template: "Update a task's editable fields.",
              reducer: "",
              errors: [
                {
                  id: "err-task-not-found",
                  name: "TaskNotFoundError",
                  code: "TASK_NOT_FOUND",
                  description: "No task with the given id was found.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-move-task",
              name: "MOVE_TASK",
              description:
                "Move a task to a package (null = unscoped) and/or before an anchor.",
              schema:
                "input MoveTaskInput {\n  id: OID!\n  packageId: OID\n  insertBefore: OID\n}",
              template:
                "Move a task to a package (null = unscoped) and/or before an anchor.",
              reducer: "",
              errors: [
                {
                  id: "err-task-package-not-found",
                  name: "TaskPackageNotFoundError",
                  code: "TASK_PACKAGE_NOT_FOUND",
                  description:
                    "No package with the given packageId was found in this WBS.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-tasks",
              name: "REORDER_TASKS",
              description:
                "Reorder tasks by moving the given ids before an anchor (or to the end when null).",
              schema:
                "input ReorderTasksInput {\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template:
                "Reorder tasks by moving the given ids before an anchor (or to the end when null).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-task",
              name: "REMOVE_TASK",
              description: "Remove a task.",
              schema: "input RemoveTaskInput {\n  id: OID!\n}",
              template: "Remove a task.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-set-task-target-spec",
              name: "SET_TASK_TARGET_SPEC",
              description:
                "Set a task's cached target-specification reference.",
              schema:
                "input SetTaskTargetSpecInput {\n  taskId: OID!\n  documentId: PHID!\n  name: String\n  kind: String\n}",
              template: "Set a task's cached target-specification reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task-target-spec-snippet",
              name: "UPDATE_TASK_TARGET_SPEC_SNIPPET",
              description: "Refresh a task's cached target-spec name/kind.",
              schema:
                "input UpdateTaskTargetSpecSnippetInput {\n  taskId: OID!\n  name: String\n  kind: String\n}",
              template: "Refresh a task's cached target-spec name/kind.",
              reducer: "",
              errors: [
                {
                  id: "err-task-target-spec-not-set",
                  name: "TaskTargetSpecNotSetError",
                  code: "TASK_TARGET_SPEC_NOT_SET",
                  description: "No target-spec reference is set on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-task-target-spec",
              name: "CLEAR_TASK_TARGET_SPEC",
              description: "Clear a task's target-spec reference.",
              schema: "input ClearTaskTargetSpecInput {\n  taskId: OID!\n}",
              template: "Clear a task's target-spec reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-set-task-parent-feature",
              name: "SET_TASK_PARENT_FEATURE",
              description:
                "Set a task's explicit parent-feature reference (overrides the WBS Feature).",
              schema:
                "input SetTaskParentFeatureInput {\n  taskId: OID!\n  documentId: PHID!\n  name: String\n  status: String\n}",
              template:
                "Set a task's explicit parent-feature reference (overrides the WBS Feature).",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task-parent-feature-snippet",
              name: "UPDATE_TASK_PARENT_FEATURE_SNIPPET",
              description:
                "Refresh a task's cached parent-feature name/status.",
              schema:
                "input UpdateTaskParentFeatureSnippetInput {\n  taskId: OID!\n  name: String\n  status: String\n}",
              template: "Refresh a task's cached parent-feature name/status.",
              reducer: "",
              errors: [
                {
                  id: "err-task-parent-feature-not-set",
                  name: "TaskParentFeatureNotSetError",
                  code: "TASK_PARENT_FEATURE_NOT_SET",
                  description:
                    "No parent-feature reference is set on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-task-parent-feature",
              name: "CLEAR_TASK_PARENT_FEATURE",
              description: "Clear a task's explicit parent-feature reference.",
              schema: "input ClearTaskParentFeatureInput {\n  taskId: OID!\n}",
              template: "Clear a task's explicit parent-feature reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-set-task-planned-in",
              name: "SET_TASK_PLANNED_IN",
              description:
                "Set the planner agent-session reference that produced this task.",
              schema:
                "input SetTaskPlannedInInput {\n  taskId: OID!\n  documentId: PHID!\n  agent: String\n  model: String\n}",
              template:
                "Set the planner agent-session reference that produced this task.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task-planned-in-snippet",
              name: "UPDATE_TASK_PLANNED_IN_SNIPPET",
              description: "Refresh the cached planner-session agent/model.",
              schema:
                "input UpdateTaskPlannedInSnippetInput {\n  taskId: OID!\n  agent: String\n  model: String\n}",
              template: "Refresh the cached planner-session agent/model.",
              reducer: "",
              errors: [
                {
                  id: "err-task-planned-in-not-set",
                  name: "TaskPlannedInNotSetError",
                  code: "TASK_PLANNED_IN_NOT_SET",
                  description:
                    "No planner-session reference is set on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-clear-task-planned-in",
              name: "CLEAR_TASK_PLANNED_IN",
              description: "Clear the planner-session reference.",
              schema: "input ClearTaskPlannedInInput {\n  taskId: OID!\n}",
              template: "Clear the planner-session reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-task-outcome-ref",
              name: "ADD_TASK_OUTCOME_REF",
              description:
                "Add a cached Problem-Sheet outcome reference the task contributes to.",
              schema:
                "input AddTaskOutcomeRefInput {\n  taskId: OID!\n  id: OID!\n  documentId: PHID!\n  objectId: OID!\n  statement: String\n  scope: String\n  insertBefore: OID\n}",
              template:
                "Add a cached Problem-Sheet outcome reference the task contributes to.",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-task-outcome-ref-id",
                  name: "DuplicateTaskOutcomeRefIdError",
                  code: "DUPLICATE_TASK_OUTCOME_REF_ID",
                  description:
                    "An outcome reference with this id already exists on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task-outcome-ref-snippet",
              name: "UPDATE_TASK_OUTCOME_REF_SNIPPET",
              description:
                "Refresh a task outcome reference's cached statement/scope.",
              schema:
                "input UpdateTaskOutcomeRefSnippetInput {\n  taskId: OID!\n  id: OID!\n  statement: String\n  scope: String\n}",
              template:
                "Refresh a task outcome reference's cached statement/scope.",
              reducer: "",
              errors: [
                {
                  id: "err-task-outcome-ref-not-found",
                  name: "TaskOutcomeRefNotFoundError",
                  code: "TASK_OUTCOME_REF_NOT_FOUND",
                  description:
                    "No outcome reference with the given id was found on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-task-outcome-ref",
              name: "REMOVE_TASK_OUTCOME_REF",
              description: "Remove a task outcome reference.",
              schema:
                "input RemoveTaskOutcomeRefInput {\n  taskId: OID!\n  id: OID!\n}",
              template: "Remove a task outcome reference.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reorder-task-outcome-refs",
              name: "REORDER_TASK_OUTCOME_REFS",
              description: "Reorder a task's outcome references.",
              schema:
                "input ReorderTaskOutcomeRefsInput {\n  taskId: OID!\n  ids: [OID!]!\n  insertBefore: OID\n}",
              template: "Reorder a task's outcome references.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-add-task-dependency",
              name: "ADD_TASK_DEPENDENCY",
              description:
                "Add a hard dependency on another task (deduped; intra-document cycles rejected).",
              schema:
                "input AddTaskDependencyInput {\n  taskId: OID!\n  id: OID!\n  documentId: PHID!\n  objectId: OID!\n  name: String\n  status: String\n}",
              template:
                "Add a hard dependency on another task (deduped; intra-document cycles rejected).",
              reducer: "",
              errors: [
                {
                  id: "err-duplicate-task-dependency-id",
                  name: "DuplicateTaskDependencyIdError",
                  code: "DUPLICATE_TASK_DEPENDENCY_ID",
                  description:
                    "A dependency with this id already exists on the task.",
                  template: "",
                },
                {
                  id: "err-dependency-cycle",
                  name: "DependencyCycleError",
                  code: "DEPENDENCY_CYCLE",
                  description:
                    "Adding this dependency would create a cycle among tasks in this document.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task-dependency-snippet",
              name: "UPDATE_TASK_DEPENDENCY_SNIPPET",
              description: "Refresh a task dependency's cached name/status.",
              schema:
                "input UpdateTaskDependencySnippetInput {\n  taskId: OID!\n  id: OID!\n  name: String\n  status: String\n}",
              template: "Refresh a task dependency's cached name/status.",
              reducer: "",
              errors: [
                {
                  id: "err-task-dependency-not-found",
                  name: "TaskDependencyNotFoundError",
                  code: "TASK_DEPENDENCY_NOT_FOUND",
                  description:
                    "No dependency with the given id was found on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-remove-task-dependency",
              name: "REMOVE_TASK_DEPENDENCY",
              description: "Remove a task dependency.",
              schema:
                "input RemoveTaskDependencyInput {\n  taskId: OID!\n  id: OID!\n}",
              template: "Remove a task dependency.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-assign-task",
              name: "ASSIGN_TASK",
              description:
                "Assign a TODO task to an executing agent session and move it to IN_PROGRESS.",
              schema:
                "input AssignTaskInput {\n  taskId: OID!\n  documentId: PHID!\n  agent: String\n  model: String\n  owner: String\n  startedAt: DateTime!\n}",
              template:
                "Assign a TODO task to an executing agent session and move it to IN_PROGRESS.",
              reducer: "",
              errors: [
                {
                  id: "err-invalid-task-transition",
                  name: "InvalidTaskTransitionError",
                  code: "INVALID_TASK_TRANSITION",
                  description:
                    "The requested task status transition is not allowed from the current status.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-update-task-session-snippet",
              name: "UPDATE_TASK_SESSION_SNIPPET",
              description:
                "Refresh the executing session's cached agent/model.",
              schema:
                "input UpdateTaskSessionSnippetInput {\n  taskId: OID!\n  agent: String\n  model: String\n}",
              template: "Refresh the executing session's cached agent/model.",
              reducer: "",
              errors: [
                {
                  id: "err-task-session-not-set",
                  name: "TaskSessionNotSetError",
                  code: "TASK_SESSION_NOT_SET",
                  description:
                    "No executing-session reference is set on the task.",
                  template: "",
                },
              ],
              examples: [],
              scope: "global",
            },
            {
              id: "op-unassign-task",
              name: "UNASSIGN_TASK",
              description: "Clear a task's session and return it to TODO.",
              schema: "input UnassignTaskInput {\n  taskId: OID!\n}",
              template: "Clear a task's session and return it to TODO.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-submit-task-for-review",
              name: "SUBMIT_TASK_FOR_REVIEW",
              description: "Move an IN_PROGRESS task to REVIEW.",
              schema: "input SubmitTaskForReviewInput {\n  taskId: OID!\n}",
              template: "Move an IN_PROGRESS task to REVIEW.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-accept-task",
              name: "ACCEPT_TASK",
              description: "Accept a task under REVIEW and move it to DONE.",
              schema:
                "input AcceptTaskInput {\n  taskId: OID!\n  completedAt: DateTime!\n}",
              template: "Accept a task under REVIEW and move it to DONE.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-reject-task",
              name: "REJECT_TASK",
              description: "Send a task under REVIEW back to IN_PROGRESS.",
              schema: "input RejectTaskInput {\n  taskId: OID!\n}",
              template: "Send a task under REVIEW back to IN_PROGRESS.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-block-task",
              name: "BLOCK_TASK",
              description: "Mark an active task BLOCKED with a reason.",
              schema:
                "input BlockTaskInput {\n  taskId: OID!\n  reason: String\n}",
              template: "Mark an active task BLOCKED with a reason.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-unblock-task",
              name: "UNBLOCK_TASK",
              description: "Return a BLOCKED task to IN_PROGRESS.",
              schema: "input UnblockTaskInput {\n  taskId: OID!\n}",
              template: "Return a BLOCKED task to IN_PROGRESS.",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "op-drop-task",
              name: "DROP_TASK",
              description: "Drop a task (abandoned), recording a reason.",
              schema:
                "input DropTaskInput {\n  taskId: OID!\n  reason: String\n}",
              template: "Drop a task (abandoned), recording a reason.",
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
