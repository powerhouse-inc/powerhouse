export type ErrorCode =
  | "DuplicateTaskIdError"
  | "TaskNotFoundError"
  | "TaskPackageNotFoundError"
  | "TaskTargetSpecNotSetError"
  | "TaskParentFeatureNotSetError"
  | "TaskPlannedInNotSetError"
  | "DuplicateTaskOutcomeRefIdError"
  | "TaskOutcomeRefNotFoundError"
  | "DuplicateTaskDependencyIdError"
  | "DependencyCycleError"
  | "TaskDependencyNotFoundError"
  | "InvalidTaskTransitionError"
  | "TaskSessionNotSetError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateTaskIdError extends Error implements ReducerError {
  errorCode = "DuplicateTaskIdError" as ErrorCode;
  constructor(message = "DuplicateTaskIdError") {
    super(message);
  }
}

export class TaskNotFoundError extends Error implements ReducerError {
  errorCode = "TaskNotFoundError" as ErrorCode;
  constructor(message = "TaskNotFoundError") {
    super(message);
  }
}

export class TaskPackageNotFoundError extends Error implements ReducerError {
  errorCode = "TaskPackageNotFoundError" as ErrorCode;
  constructor(message = "TaskPackageNotFoundError") {
    super(message);
  }
}

export class TaskTargetSpecNotSetError extends Error implements ReducerError {
  errorCode = "TaskTargetSpecNotSetError" as ErrorCode;
  constructor(message = "TaskTargetSpecNotSetError") {
    super(message);
  }
}

export class TaskParentFeatureNotSetError
  extends Error
  implements ReducerError
{
  errorCode = "TaskParentFeatureNotSetError" as ErrorCode;
  constructor(message = "TaskParentFeatureNotSetError") {
    super(message);
  }
}

export class TaskPlannedInNotSetError extends Error implements ReducerError {
  errorCode = "TaskPlannedInNotSetError" as ErrorCode;
  constructor(message = "TaskPlannedInNotSetError") {
    super(message);
  }
}

export class DuplicateTaskOutcomeRefIdError
  extends Error
  implements ReducerError
{
  errorCode = "DuplicateTaskOutcomeRefIdError" as ErrorCode;
  constructor(message = "DuplicateTaskOutcomeRefIdError") {
    super(message);
  }
}

export class TaskOutcomeRefNotFoundError extends Error implements ReducerError {
  errorCode = "TaskOutcomeRefNotFoundError" as ErrorCode;
  constructor(message = "TaskOutcomeRefNotFoundError") {
    super(message);
  }
}

export class DuplicateTaskDependencyIdError
  extends Error
  implements ReducerError
{
  errorCode = "DuplicateTaskDependencyIdError" as ErrorCode;
  constructor(message = "DuplicateTaskDependencyIdError") {
    super(message);
  }
}

export class DependencyCycleError extends Error implements ReducerError {
  errorCode = "DependencyCycleError" as ErrorCode;
  constructor(message = "DependencyCycleError") {
    super(message);
  }
}

export class TaskDependencyNotFoundError extends Error implements ReducerError {
  errorCode = "TaskDependencyNotFoundError" as ErrorCode;
  constructor(message = "TaskDependencyNotFoundError") {
    super(message);
  }
}

export class InvalidTaskTransitionError extends Error implements ReducerError {
  errorCode = "InvalidTaskTransitionError" as ErrorCode;
  constructor(message = "InvalidTaskTransitionError") {
    super(message);
  }
}

export class TaskSessionNotSetError extends Error implements ReducerError {
  errorCode = "TaskSessionNotSetError" as ErrorCode;
  constructor(message = "TaskSessionNotSetError") {
    super(message);
  }
}

export const errors = {
  AddTask: { DuplicateTaskIdError },
  UpdateTask: { TaskNotFoundError },
  MoveTask: { TaskPackageNotFoundError },
  UpdateTaskTargetSpecSnippet: { TaskTargetSpecNotSetError },
  UpdateTaskParentFeatureSnippet: { TaskParentFeatureNotSetError },
  UpdateTaskPlannedInSnippet: { TaskPlannedInNotSetError },
  AddTaskOutcomeRef: { DuplicateTaskOutcomeRefIdError },
  UpdateTaskOutcomeRefSnippet: { TaskOutcomeRefNotFoundError },
  AddTaskDependency: { DuplicateTaskDependencyIdError, DependencyCycleError },
  UpdateTaskDependencySnippet: { TaskDependencyNotFoundError },
  AssignTask: { InvalidTaskTransitionError },
  UpdateTaskSessionSnippet: { TaskSessionNotSetError },
};
