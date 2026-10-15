import type {
  Action,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import {
  baseActions,
  DOCUMENT_SCOPE_ACTION_TYPES,
} from "@powerhousedao/shared/document-model";
import { camelCase } from "change-case";
import { z } from "zod";
import { ReactorToolError, type ActionFailure } from "./errors.js";
import { actionOperations, ANY_SCOPE, type ModelOperation } from "./schema.js";
import { suggestNames } from "./suggest.js";

export const actionInputSchema = z.object({
  type: z
    .string()
    .describe(
      "Exact action type from the model's operations, e.g. SET_MODEL_NAME; see getDocumentModelSchema",
    ),
  input: z
    .unknown()
    .optional()
    .describe("Action input, shaped by the operation's input schema"),
  scope: z
    .string()
    .optional()
    .describe("Defaults to the operation's scope; rarely needed"),
});

export type ActionInput = z.infer<typeof actionInputSchema>;

export type ValidateActionsOptions = {
  /** Action types the caller may send; others fail as FORBIDDEN. */
  allowedActionTypes?: readonly string[];
};

export type ValidatedActions = {
  actions: Action[];
  failures: ActionFailure[];
};

type ActionCreator = (input: unknown) => Action;

function countInput(input: unknown): number | undefined {
  if (typeof input === "number") return input;
  const count = (input as { count?: unknown } | null)?.count;
  return typeof count === "number" ? count : undefined;
}

const BASE_CREATORS: Partial<Record<string, ActionCreator>> = {
  SET_NAME: (input) => baseActions.setName(input as string | { name: string }),
  SET_PREFERRED_EDITOR: (input) =>
    baseActions.setPreferredEditor(
      input as string | null | { preferredEditor: string | null },
    ),
  UNDO: (input) => baseActions.undo(countInput(input)),
  REDO: (input) => baseActions.redo(countInput(input)),
  NOOP: () => baseActions.noop(),
};

function issueLines(error: unknown): { lines: string[]; shape: boolean } {
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    return {
      shape: true,
      lines: issues.map((raw) => {
        const issue = raw as { path?: unknown[]; message?: string };
        const path = Array.isArray(issue.path) ? issue.path.join(".") : "";
        const message = (issue.message ?? "invalid").replace(
          /^Invalid input:\s*/,
          "",
        );
        return path ? `${path}: ${message}` : message;
      }),
    };
  }
  return {
    shape: false,
    lines: [error instanceof Error ? error.message : String(error)],
  };
}

/** Builds the actions, collecting every failure instead of stopping at the first. */
export function validateActions(
  module: DocumentModelModule,
  inputs: readonly ActionInput[],
  options: ValidateActionsOptions = {},
): ValidatedActions {
  const operations = new Map(actionOperations(module).map((o) => [o.name, o]));
  const allowed = options.allowedActionTypes
    ? new Set(options.allowedActionTypes)
    : undefined;
  const actions: Action[] = [];
  const failures: ActionFailure[] = [];
  inputs.forEach((entry, index) => {
    const fail = (code: ActionFailure["code"], errors: string[]) =>
      failures.push({ index, type: entry.type, code, errors });
    if (DOCUMENT_SCOPE_ACTION_TYPES.has(entry.type)) {
      return fail("FORBIDDEN", [
        "document lifecycle actions are refused; use createDocument or deleteDocument",
      ]);
    }
    if (allowed && !allowed.has(entry.type)) {
      return fail("FORBIDDEN", [
        `not an allowed action type (allowed: ${[...allowed].join(", ")})`,
      ]);
    }
    const operation = operations.get(entry.type);
    if (!operation) {
      return fail("INVALID_ACTION", ["unknown action type"]);
    }
    if (entry.scope === ANY_SCOPE) {
      return fail("INVALID_ACTION", [
        `"${ANY_SCOPE}" is not a scope; name one, e.g. "global"`,
      ]);
    }
    const anyScope = operation.scope === ANY_SCOPE;
    const scope = entry.scope ?? (anyScope ? "global" : operation.scope);
    if (!anyScope && scope !== operation.scope) {
      return fail("INVALID_ACTION", [
        `scope "${scope}" does not match the operation's scope "${operation.scope}"`,
      ]);
    }
    const creator =
      BASE_CREATORS[entry.type] ??
      (module.actions[camelCase(entry.type)] as ActionCreator | undefined);
    if (!creator) {
      return fail("INVALID_ACTION", [
        `the model has no action creator for ${entry.type}`,
      ]);
    }
    try {
      actions.push({ ...creator(entry.input ?? {}), scope });
    } catch (error) {
      fail("INVALID_ACTION", issueLines(error).lines);
    }
  });
  return { actions, failures };
}

/** One line per failed action, did-you-mean for unknown types, and input schemas for shape errors. */
export function formatActionFailures(
  failures: readonly ActionFailure[],
  module?: DocumentModelModule,
): string {
  const operations: ModelOperation[] = module ? actionOperations(module) : [];
  const names = operations.map((o) => o.name);
  const count = failures.length;
  const lines = failures.map(
    (f) => `  [${f.index}] ${f.type}: ${f.errors.join("; ")}`,
  );
  const sections: string[] = [];
  const unknown = failures.filter(
    (f) => f.code === "INVALID_ACTION" && module && !names.includes(f.type),
  );
  if (unknown.length > 0) {
    const suggestions = new Set(
      unknown.flatMap((f) => suggestNames(f.type, names)),
    );
    const hint = suggestions.size
      ? `Did you mean: ${[...suggestions].join(", ")}?\n`
      : "";
    sections.push(
      `${hint}Valid action types for ${module?.documentModel.global.id}:\n  ${names.join(", ")}`,
    );
  }
  const shown = new Set<string>();
  for (const f of failures) {
    const operation = operations.find((o) => o.name === f.type);
    if (
      f.code !== "INVALID_ACTION" ||
      !operation?.schema ||
      shown.has(operation.name)
    ) {
      continue;
    }
    shown.add(operation.name);
    sections.push(`Input schema for ${operation.name}:\n${operation.schema}`);
  }
  const head = `${count} action${count === 1 ? "" : "s"} failed:\n${lines.join("\n")}`;
  return sections.length ? `${head}\n\n${sections.join("\n\n")}` : head;
}

/** The error for a batch with failures; the code is the batch's most severe one. */
export function actionFailuresError(
  failures: ActionFailure[],
  module?: DocumentModelModule,
): ReactorToolError {
  const codes = new Set(failures.map((f) => f.code));
  const code = codes.has("FORBIDDEN")
    ? "FORBIDDEN"
    : codes.has("INVALID_ACTION")
      ? "INVALID_ACTION"
      : "REDUCER_ERROR";
  return new ReactorToolError(code, formatActionFailures(failures, module), {
    failures,
  });
}
