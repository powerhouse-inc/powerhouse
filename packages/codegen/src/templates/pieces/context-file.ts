import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export const pieceContextFileTemplate = (v: PieceNames) =>
  ts`
import { readAuth } from "./auth-value.js";
import { ${v.pascalCaseName}Client } from "./client.js";

// The subset of the framework's Store this piece uses, declared structurally
// so actions and triggers stay testable without building a whole context.
export interface StoreLike {
  get(key: string): Promise<unknown>;
  put(key: string, value: unknown): Promise<unknown>;
}

// Only what the client needs, so every context the host hands a hook fits.
export interface ${v.pascalCaseName}RunContext {
  auth?: unknown;
}

export function clientFor(auth: unknown): ${v.pascalCaseName}Client {
  return new ${v.pascalCaseName}Client(readAuth(auth));
}

export function clientForContext(
  context: ${v.pascalCaseName}RunContext,
): ${v.pascalCaseName}Client {
  return clientFor(context.auth);
}
`.raw;
