export type ErrorCode =
  | "DuplicateSegmentIdError"
  | "SegmentNotFoundError"
  | "DuplicateSegmentRoleIdError"
  | "SegmentRoleNotFoundError"
  | "DuplicateOutcomePriorityIdError"
  | "OutcomePriorityNotFoundError"
  | "DuplicateEvidenceIdError"
  | "EvidenceNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
}

export class DuplicateSegmentIdError extends Error implements ReducerError {
  errorCode = "DuplicateSegmentIdError" as ErrorCode;
  constructor(message = "DuplicateSegmentIdError") {
    super(message);
  }
}

export class SegmentNotFoundError extends Error implements ReducerError {
  errorCode = "SegmentNotFoundError" as ErrorCode;
  constructor(message = "SegmentNotFoundError") {
    super(message);
  }
}

export class DuplicateSegmentRoleIdError extends Error implements ReducerError {
  errorCode = "DuplicateSegmentRoleIdError" as ErrorCode;
  constructor(message = "DuplicateSegmentRoleIdError") {
    super(message);
  }
}

export class SegmentRoleNotFoundError extends Error implements ReducerError {
  errorCode = "SegmentRoleNotFoundError" as ErrorCode;
  constructor(message = "SegmentRoleNotFoundError") {
    super(message);
  }
}

export class DuplicateOutcomePriorityIdError
  extends Error
  implements ReducerError
{
  errorCode = "DuplicateOutcomePriorityIdError" as ErrorCode;
  constructor(message = "DuplicateOutcomePriorityIdError") {
    super(message);
  }
}

export class OutcomePriorityNotFoundError
  extends Error
  implements ReducerError
{
  errorCode = "OutcomePriorityNotFoundError" as ErrorCode;
  constructor(message = "OutcomePriorityNotFoundError") {
    super(message);
  }
}

export class DuplicateEvidenceIdError extends Error implements ReducerError {
  errorCode = "DuplicateEvidenceIdError" as ErrorCode;
  constructor(message = "DuplicateEvidenceIdError") {
    super(message);
  }
}

export class EvidenceNotFoundError extends Error implements ReducerError {
  errorCode = "EvidenceNotFoundError" as ErrorCode;
  constructor(message = "EvidenceNotFoundError") {
    super(message);
  }
}

export const errors = {
  AddSegment: { DuplicateSegmentIdError },
  UpdateSegment: { SegmentNotFoundError },
  AddSegmentRole: { DuplicateSegmentRoleIdError },
  UpdateSegmentRoleSnippet: { SegmentRoleNotFoundError },
  AddOutcomePriority: { DuplicateOutcomePriorityIdError },
  UpdateOutcomePriority: { OutcomePriorityNotFoundError },
  AddSegmentEvidence: { DuplicateEvidenceIdError },
  UpdateSegmentEvidence: { EvidenceNotFoundError },
};
