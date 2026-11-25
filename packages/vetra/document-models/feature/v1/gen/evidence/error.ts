export type ErrorCode = "DuplicateEvidenceIdError" | "EvidenceNotFoundError";

export interface ReducerError {
  errorCode: ErrorCode;
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
  AddEvidence: { DuplicateEvidenceIdError },
  UpdateEvidence: { EvidenceNotFoundError },
};
