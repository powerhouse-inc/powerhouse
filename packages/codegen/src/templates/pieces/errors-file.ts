import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export const pieceErrorsFileTemplate = (v: PieceNames) =>
  ts`
// The reactor serializes a piece error by copying its own enumerable keys
// across IPC, so these are plain fields rather than accessors.

export type ${v.pascalCaseName}ErrorCategory =
  | "validation"
  | "credential"
  | "permission"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "server"
  | "network"
  | "config"
  | "timeout";

export class ${v.pascalCaseName}ApiError extends Error {
  readonly status?: number;
  readonly category: ${v.pascalCaseName}ErrorCategory;
  readonly retryable: boolean;
  readonly detail?: unknown;

  constructor(
    message: string,
    options: {
      status?: number;
      category: ${v.pascalCaseName}ErrorCategory;
      retryable?: boolean;
      detail?: unknown;
    },
  ) {
    super(message);
    this.name = "${v.pascalCaseName}ApiError";
    this.status = options.status;
    this.category = options.category;
    this.retryable = options.retryable ?? false;
    this.detail = options.detail;
  }
}

// Status -> category, in the terms an operator can act on.
export function categoryForStatus(
  status: number,
): ${v.pascalCaseName}ErrorCategory {
  if (status === 400 || status === 422) return "validation";
  if (status === 401) return "credential";
  if (status === 403) return "permission";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 429) return "rate_limit";
  return "server";
}

// Lift whatever message the service put in the body; an unexpected shape is
// still worth surfacing, because it usually means a proxy answered.
export function describeApiError(body: unknown): string | undefined {
  if (typeof body === "string" && body.trim() !== "") return body.trim();
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  for (const key of ["error", "message", "detail"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}
`.raw;
