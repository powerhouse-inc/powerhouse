export class AbortError extends Error {
  constructor(message?: string) {
    super(message || "Aborted");

    this.name = "AbortError";
  }
}

export const isAbortError = (error: unknown): boolean => {
  return error instanceof AbortError;
};
