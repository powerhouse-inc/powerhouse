// Pure helpers over what the reactor client returns: documents, model modules
// and the actions sent to them. Type-only imports, so the bundle stays small.
import type {
  Action,
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";

export const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";
export const DRIVE_DOCUMENT_TYPES = new Set([
  DRIVE_DOCUMENT_TYPE,
  "powerhouse/reactor-drive",
]);

export const DEFAULT_BRANCH = "main";
export const DEFAULT_SCOPE = "global";

// A document as a step outputs it; operations and clipboard stay in the journal.
export interface DocumentOutput {
  header: PHDocument["header"];
  state: PHDocument["state"];
}

export function documentOutput(document: PHDocument): DocumentOutput {
  return { header: document.header, state: document.state };
}

function globalState(document: PHDocument): Record<string, unknown> {
  const state = (document.state as { global?: unknown }).global;
  return state && typeof state === "object"
    ? (state as Record<string, unknown>)
    : {};
}

// Models usually keep the display name in state; the header name can lag.
export function displayName(document: PHDocument): string {
  const name = globalState(document).name;
  return (typeof name === "string" && name) || document.header.name || "";
}

function stateValueAt(document: PHDocument, path: string): unknown {
  let current: unknown = globalState(document);
  for (const segment of path.split(".")) {
    if (typeof current !== "object" || current === null) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

// Compared as text, since expressions resolve to text; a path landing on
// anything but a scalar is a mismatch, not an error.
export function matchesState(
  document: PHDocument,
  match: { path: string; value: string } | undefined,
): boolean {
  if (!match) return true;
  const value = stateValueAt(document, match.path);
  if (typeof value === "string") return value === match.value;
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return String(value) === match.value;
  }
  return false;
}

export interface ModelAction {
  type: string;
  module: string;
  scope: string;
  inputSchema: string | null;
}

// Every document accepts SET_NAME, beyond its model's own operations.
export const SET_NAME_ACTION: ModelAction = {
  type: "SET_NAME",
  module: "base",
  scope: DEFAULT_SCOPE,
  inputSchema: "input SetNameInput {\n  name: String!\n}",
};

export interface ModelDescription {
  documentType: string;
  name: string;
  stateSchema: string | null;
  actions: ModelAction[];
}

// The latest specification's operations and state schema.
export function describeModel(module: DocumentModelModule): ModelDescription {
  const model = module.documentModel.global;
  const latest = model.specifications.at(-1);
  return {
    documentType: model.id,
    name: model.name,
    stateSchema: latest?.state.global.schema ?? null,
    actions: [
      ...(latest?.modules ?? []).flatMap((specModule) =>
        specModule.operations.flatMap((operation) =>
          operation.name
            ? [
                {
                  type: operation.name,
                  module: specModule.name,
                  scope: operation.scope || DEFAULT_SCOPE,
                  inputSchema: operation.schema ?? null,
                },
              ]
            : [],
        ),
      ),
      SET_NAME_ACTION,
    ],
  };
}

export function plainAction(
  type: string,
  input: unknown,
  scope: string = DEFAULT_SCOPE,
): Action {
  return {
    id: crypto.randomUUID(),
    timestampUtcMs: new Date().toISOString(),
    type,
    input,
    scope,
  };
}

// SET_MODEL_NAME -> setModelName, the key codegen gives a creator.
function creatorKey(type: string): string {
  return type
    .toLowerCase()
    .replace(/_+([a-z0-9])/g, (_, letter: string) => letter.toUpperCase());
}

// Built by the model's own creator, which validates the input, when it has
// one; otherwise a plain action in the operation's scope.
export function typedAction(
  module: DocumentModelModule,
  type: string,
  input: unknown,
): Action {
  const creator = module.actions[creatorKey(type)] as
    | ((input: unknown) => Action)
    | undefined;
  if (creator) {
    const action = creator(input);
    if (action.type === type) return action;
  }
  const spec = describeModel(module).actions.find(
    (action) => action.type === type,
  );
  return plainAction(type, input, spec?.scope);
}
