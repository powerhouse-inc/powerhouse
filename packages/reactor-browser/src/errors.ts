import {
  operationOutcome,
  type Operation,
  type OperationOutcome,
} from "@powerhousedao/shared/document-model";

type RejectedOutcome = Exclude<OperationOutcome, { kind: "applied" }>;

export class UnsupportedDocumentTypeError extends Error {
  constructor(documentType: string) {
    super(`Document type ${documentType} is not supported`);
    this.name = "UnsupportedDocumentTypeError";
  }

  static override isError(
    error: unknown,
  ): error is UnsupportedDocumentTypeError {
    return (
      Error.isError(error) && error.name === "UnsupportedDocumentTypeError"
    );
  }
}

export class DocumentModelNotFoundError extends Error {
  readonly documentType: string;
  override readonly name = "DocumentModelNotFoundError";

  constructor(documentType: string) {
    super(`Document model module for type ${documentType} not found`);
    this.documentType = documentType;
  }

  static override isError(error: unknown): error is DocumentModelNotFoundError {
    return Error.isError(error) && error.name === "DocumentModelNotFoundError";
  }
}

export class DocumentTypeMismatchError extends Error {
  constructor(documentId: string, expectedType: string, actualType: string) {
    super(
      `Document ${documentId} is not of type ${expectedType}. Actual type: ${actualType}`,
    );
  }
}

export class NoSelectedDocumentError extends Error {
  constructor() {
    super(
      "There is no selected document. Did you mean to call 'useSelectedDocumentSafe' instead?",
    );
  }
}

/** A dispatched action the document did not apply: its operation is stored at `index`, state
 * unchanged, because the reducer threw (`reducer-error`) or the write was denied (`denied`). */
export class OperationRejectedError extends Error {
  override readonly name = "OperationRejectedError";
  readonly actionId: string;
  readonly actionType: string;
  readonly index: number;
  readonly kind: "reducer-error" | "denied";

  private constructor(
    readonly documentId: string,
    readonly scope: string,
    operation: Operation,
    outcome: RejectedOutcome,
  ) {
    super(outcome.kind === "denied" ? outcome.reason : outcome.message);
    this.actionId = operation.action.id;
    this.actionType = operation.action.type;
    this.index = operation.index;
    this.kind = outcome.kind;
  }

  /** The rejection `operation` records, or undefined when it applied. */
  static fromOperation(
    documentId: string,
    scope: string,
    operation: Operation,
  ): OperationRejectedError | undefined {
    const outcome = operationOutcome(operation);
    return outcome.kind === "applied"
      ? undefined
      : new OperationRejectedError(documentId, scope, operation, outcome);
  }

  static override isError(error: unknown): error is OperationRejectedError {
    return Error.isError(error) && error.name === "OperationRejectedError";
  }
}
