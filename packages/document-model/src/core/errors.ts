import type { ZodIssue } from "zod";
import type { Operation, PHDocument } from "./ph-types.js";

export const FileSystemError = new Error("File system not available.");

export class InvalidActionInputError extends Error {
  public data: unknown;
  constructor(data: unknown) {
    super();
    this.name = "InvalidActionInputError";
    this.data = data;
    this.message =
      this.message || `Invalid action input: ${JSON.stringify(data, null, 2)}`;
  }
}

export class InvalidActionInputZodError extends InvalidActionInputError {
  public issues: ZodIssue[];

  constructor(issues: ZodIssue[]) {
    super(issues);
    this.issues = issues;
    this.name = "InvalidActionInputZodError";
  }
}

export class HashMismatchError extends Error {
  protected _scope: string;
  protected _document: PHDocument;
  protected _operation: Operation;

  constructor(scope: string, document: PHDocument, operation: Operation) {
    super();
    this.name = "HashMismatchError";
    this._document = document;
    this._scope = scope;
    this._operation = operation;

    this.message = JSON.stringify(
      {
        error: `Hash mismatch on document ${document.header.id}, scope ${scope}, index ${operation.index}`,
        document,
        operation,
      },
      null,
      1,
    );
  }

  get document() {
    return this._document;
  }

  get scope() {
    return this._scope;
  }

  get operation() {
    return this._operation;
  }
}
