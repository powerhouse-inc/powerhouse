import type { WorkBreakdownStructureTasksOperations } from "document-models/work-breakdown-structure/v1";
import type {
  Task,
  TaskStatus,
  WorkBreakdownStructureGlobalState,
} from "../../gen/types.js";
import {
  DependencyCycleError,
  DuplicateTaskDependencyIdError,
  DuplicateTaskIdError,
  DuplicateTaskOutcomeRefIdError,
  InvalidTaskTransitionError,
  TaskDependencyNotFoundError,
  TaskNotFoundError,
  TaskOutcomeRefNotFoundError,
  TaskPackageNotFoundError,
  TaskParentFeatureNotSetError,
  TaskPlannedInNotSetError,
  TaskSessionNotSetError,
  TaskTargetSpecNotSetError,
} from "../../gen/tasks/error.js";
import { insertItem, reorderById } from "../reorder.js";

function findTask(
  state: WorkBreakdownStructureGlobalState,
  taskId: string,
): Task {
  const task = state.tasks.find((t) => t.id === taskId);
  if (!task) throw new TaskNotFoundError(`Task ${taskId} not found.`);
  return task;
}

function assertStatus(
  current: TaskStatus,
  allowed: TaskStatus[],
  transition: string,
): void {
  if (!allowed.includes(current)) {
    throw new InvalidTaskTransitionError(
      `Cannot ${transition} from status ${current}.`,
    );
  }
}

/**
 * True when adding a dependency from `taskId` onto `depObjectId` would close a
 * cycle among tasks within this document. Cross-document dependencies (whose
 * target is not a local task) cannot be checked and are treated as acyclic.
 */
function wouldCreateCycle(
  state: WorkBreakdownStructureGlobalState,
  taskId: string,
  depObjectId: string,
): boolean {
  const localIds = new Set(state.tasks.map((t) => t.id));
  if (!localIds.has(depObjectId)) return false;
  const edges = new Map<string, string[]>();
  for (const t of state.tasks) {
    edges.set(
      t.id,
      t.dependsOn.map((d) => d.objectId).filter((o) => localIds.has(o)),
    );
  }
  const stack = [depObjectId];
  const visited = new Set<string>();
  while (stack.length > 0) {
    const current = stack.pop();
    if (current === undefined) break;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of edges.get(current) ?? []) stack.push(next);
  }
  return false;
}

export const workBreakdownStructureTasksOperations: WorkBreakdownStructureTasksOperations =
  {
    addTaskOperation(state, action) {
      if (state.tasks.some((t) => t.id === action.input.id)) {
        throw new DuplicateTaskIdError(
          `Task ${action.input.id} already exists.`,
        );
      }
      if (
        action.input.packageId &&
        !state.packages.some((p) => p.id === action.input.packageId)
      ) {
        throw new TaskPackageNotFoundError(
          `Package ${action.input.packageId} not found.`,
        );
      }
      insertItem(
        state.tasks,
        {
          id: action.input.id,
          packageId: action.input.packageId ?? null,
          name: action.input.name,
          description: action.input.description ?? null,
          taskKind: action.input.taskKind,
          targetSpec: null,
          targetOutcomes: [],
          acceptanceCriteria: action.input.acceptanceCriteria ?? null,
          status: "TODO",
          owner: action.input.owner ?? null,
          session: null,
          plannedIn: null,
          dependsOn: [],
          parentFeature: null,
          startedAt: null,
          completedAt: null,
          notes: null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updateTaskOperation(state, action) {
      const task = findTask(state, action.input.id);
      if (action.input.name) task.name = action.input.name;
      if (action.input.description) task.description = action.input.description;
      if (action.input.taskKind) task.taskKind = action.input.taskKind;
      if (action.input.acceptanceCriteria) {
        task.acceptanceCriteria = action.input.acceptanceCriteria;
      }
      if (action.input.owner) task.owner = action.input.owner;
      if (action.input.notes) task.notes = action.input.notes;
    },
    moveTaskOperation(state, action) {
      const task = findTask(state, action.input.id);
      if (
        action.input.packageId &&
        !state.packages.some((p) => p.id === action.input.packageId)
      ) {
        throw new TaskPackageNotFoundError(
          `Package ${action.input.packageId} not found.`,
        );
      }
      task.packageId = action.input.packageId ?? null;
      if (action.input.insertBefore) {
        reorderById(state.tasks, [action.input.id], action.input.insertBefore);
      }
    },
    reorderTasksOperation(state, action) {
      for (const id of action.input.ids) {
        if (!state.tasks.some((t) => t.id === id)) {
          throw new TaskNotFoundError(`Task ${id} not found.`);
        }
      }
      reorderById(
        state.tasks,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
    removeTaskOperation(state, action) {
      const index = state.tasks.findIndex((t) => t.id === action.input.id);
      if (index === -1) {
        throw new TaskNotFoundError(`Task ${action.input.id} not found.`);
      }
      state.tasks.splice(index, 1);
    },
    setTaskTargetSpecOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      task.targetSpec = {
        documentId: action.input.documentId,
        name: action.input.name ?? null,
        kind: action.input.kind ?? null,
      };
    },
    updateTaskTargetSpecSnippetOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      if (!task.targetSpec) {
        throw new TaskTargetSpecNotSetError(
          `Task ${action.input.taskId} has no target spec.`,
        );
      }
      if (action.input.name) task.targetSpec.name = action.input.name;
      if (action.input.kind) task.targetSpec.kind = action.input.kind;
    },
    clearTaskTargetSpecOperation(state, action) {
      findTask(state, action.input.taskId).targetSpec = null;
    },
    setTaskParentFeatureOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      task.parentFeature = {
        documentId: action.input.documentId,
        name: action.input.name ?? null,
        status: action.input.status ?? null,
      };
    },
    updateTaskParentFeatureSnippetOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      if (!task.parentFeature) {
        throw new TaskParentFeatureNotSetError(
          `Task ${action.input.taskId} has no parent-feature reference.`,
        );
      }
      if (action.input.name) task.parentFeature.name = action.input.name;
      if (action.input.status) task.parentFeature.status = action.input.status;
    },
    clearTaskParentFeatureOperation(state, action) {
      findTask(state, action.input.taskId).parentFeature = null;
    },
    setTaskPlannedInOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      task.plannedIn = {
        documentId: action.input.documentId,
        agent: action.input.agent ?? null,
        model: action.input.model ?? null,
      };
    },
    updateTaskPlannedInSnippetOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      if (!task.plannedIn) {
        throw new TaskPlannedInNotSetError(
          `Task ${action.input.taskId} has no planner-session reference.`,
        );
      }
      if (action.input.agent) task.plannedIn.agent = action.input.agent;
      if (action.input.model) task.plannedIn.model = action.input.model;
    },
    clearTaskPlannedInOperation(state, action) {
      findTask(state, action.input.taskId).plannedIn = null;
    },
    addTaskOutcomeRefOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      if (task.targetOutcomes.some((o) => o.id === action.input.id)) {
        throw new DuplicateTaskOutcomeRefIdError(
          `Outcome reference ${action.input.id} already exists on the task.`,
        );
      }
      insertItem(
        task.targetOutcomes,
        {
          id: action.input.id,
          documentId: action.input.documentId,
          objectId: action.input.objectId,
          statement: action.input.statement ?? null,
          scope: action.input.scope ?? null,
        },
        action.input.insertBefore ?? null,
      );
    },
    updateTaskOutcomeRefSnippetOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      const ref = task.targetOutcomes.find((o) => o.id === action.input.id);
      if (!ref) {
        throw new TaskOutcomeRefNotFoundError(
          `Outcome reference ${action.input.id} not found on the task.`,
        );
      }
      if (action.input.statement) ref.statement = action.input.statement;
      if (action.input.scope) ref.scope = action.input.scope;
    },
    removeTaskOutcomeRefOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      const index = task.targetOutcomes.findIndex(
        (o) => o.id === action.input.id,
      );
      if (index === -1) {
        throw new TaskOutcomeRefNotFoundError(
          `Outcome reference ${action.input.id} not found on the task.`,
        );
      }
      task.targetOutcomes.splice(index, 1);
    },
    reorderTaskOutcomeRefsOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      for (const id of action.input.ids) {
        if (!task.targetOutcomes.some((o) => o.id === id)) {
          throw new TaskOutcomeRefNotFoundError(
            `Outcome reference ${id} not found on the task.`,
          );
        }
      }
      reorderById(
        task.targetOutcomes,
        action.input.ids,
        action.input.insertBefore ?? null,
      );
    },
    addTaskDependencyOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      if (task.dependsOn.some((d) => d.id === action.input.id)) {
        throw new DuplicateTaskDependencyIdError(
          `Dependency ${action.input.id} already exists on the task.`,
        );
      }
      if (wouldCreateCycle(state, action.input.taskId, action.input.objectId)) {
        throw new DependencyCycleError(
          `Dependency on ${action.input.objectId} would create a cycle.`,
        );
      }
      task.dependsOn.push({
        id: action.input.id,
        documentId: action.input.documentId,
        objectId: action.input.objectId,
        name: action.input.name ?? null,
        status: action.input.status ?? null,
      });
    },
    updateTaskDependencySnippetOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      const dep = task.dependsOn.find((d) => d.id === action.input.id);
      if (!dep) {
        throw new TaskDependencyNotFoundError(
          `Dependency ${action.input.id} not found on the task.`,
        );
      }
      if (action.input.name) dep.name = action.input.name;
      if (action.input.status) dep.status = action.input.status;
    },
    removeTaskDependencyOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      const index = task.dependsOn.findIndex((d) => d.id === action.input.id);
      if (index === -1) {
        throw new TaskDependencyNotFoundError(
          `Dependency ${action.input.id} not found on the task.`,
        );
      }
      task.dependsOn.splice(index, 1);
    },
    assignTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(task.status, ["TODO"], "assign");
      task.session = {
        documentId: action.input.documentId,
        agent: action.input.agent ?? null,
        model: action.input.model ?? null,
      };
      if (action.input.owner) task.owner = action.input.owner;
      task.startedAt = action.input.startedAt;
      task.status = "IN_PROGRESS";
    },
    updateTaskSessionSnippetOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      if (!task.session) {
        throw new TaskSessionNotSetError(
          `Task ${action.input.taskId} has no executing-session reference.`,
        );
      }
      if (action.input.agent) task.session.agent = action.input.agent;
      if (action.input.model) task.session.model = action.input.model;
    },
    unassignTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(
        task.status,
        ["IN_PROGRESS", "REVIEW", "BLOCKED"],
        "unassign",
      );
      task.session = null;
      task.status = "TODO";
    },
    submitTaskForReviewOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(task.status, ["IN_PROGRESS"], "submit for review");
      task.status = "REVIEW";
    },
    acceptTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(task.status, ["REVIEW"], "accept");
      task.status = "DONE";
      task.completedAt = action.input.completedAt;
    },
    rejectTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(task.status, ["REVIEW"], "reject");
      task.status = "IN_PROGRESS";
    },
    blockTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(task.status, ["TODO", "IN_PROGRESS", "REVIEW"], "block");
      task.status = "BLOCKED";
      if (action.input.reason) task.notes = action.input.reason;
    },
    unblockTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(task.status, ["BLOCKED"], "unblock");
      task.status = "IN_PROGRESS";
    },
    dropTaskOperation(state, action) {
      const task = findTask(state, action.input.taskId);
      assertStatus(
        task.status,
        ["TODO", "IN_PROGRESS", "REVIEW", "BLOCKED"],
        "drop",
      );
      task.status = "DROPPED";
      if (action.input.reason) task.notes = action.input.reason;
    },
  };
