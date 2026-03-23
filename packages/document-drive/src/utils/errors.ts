export class AbortError extends Error {
  constructor(message?: string) {
    super(message || "Aborted");

    this.name = "AbortError";
  }
}
