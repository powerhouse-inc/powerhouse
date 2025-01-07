import { ZodIssue } from "zod";

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
