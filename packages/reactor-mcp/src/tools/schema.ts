import type {
  DocumentModelModule,
  DocumentSpecification,
  OperationSpecification,
} from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { ReactorToolError } from "./errors.js";
import { unknownValueMessage } from "./suggest.js";

/** Marks a base action that runs in whichever scope it is sent to; never itself a scope. */
export const ANY_SCOPE = "any";

// Base actions every document accepts beyond its model's operations.
export const BASE_OPERATIONS: readonly ModelOperation[] = [
  {
    name: "SET_NAME",
    module: "base",
    scope: "global",
    description: "Renames the document",
    schema: "input SetNameInput {\n  name: String!\n}",
  },
  {
    name: "SET_PREFERRED_EDITOR",
    module: "base",
    scope: "header",
    description: "Sets the editor that opens the document",
    schema: "input SetPreferredEditorInput {\n  preferredEditor: String\n}",
  },
  {
    name: "UNDO",
    module: "base",
    scope: ANY_SCOPE,
    description: "Undoes the scope's last operations",
    schema: "input UndoInput {\n  count: Int\n}",
  },
  {
    name: "REDO",
    module: "base",
    scope: ANY_SCOPE,
    description: "Redoes the scope's last undone operations",
    schema: "input RedoInput {\n  count: Int\n}",
  },
  {
    name: "NOOP",
    module: "base",
    scope: ANY_SCOPE,
    description: "Changes nothing",
  },
];

export const modelOperationSchema = z.object({
  name: z.string(),
  module: z.string(),
  scope: z.string(),
  description: z.string().optional(),
  schema: z.string().optional().describe("GraphQL SDL of the action input"),
});

export type ModelOperation = z.infer<typeof modelOperationSchema>;

export const documentModelInfoSchema = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  extension: z.string(),
  authorName: z.string(),
  authorWebsite: z.string(),
});

export type DocumentModelInfo = z.infer<typeof documentModelInfoSchema>;

export function documentModelInfo(
  module: DocumentModelModule,
): DocumentModelInfo {
  const global = module.documentModel.global;
  return {
    type: global.id,
    name: global.name,
    description: global.description,
    extension: global.extension,
    authorName: global.author.name,
    authorWebsite: global.author.website ?? "",
  };
}

export function latestSpecification(
  module: DocumentModelModule,
): DocumentSpecification | undefined {
  return module.documentModel.global.specifications.at(-1);
}

/** The model's operations in its latest specification, without the base ones. */
export function modelOperations(module: DocumentModelModule): ModelOperation[] {
  return (latestSpecification(module)?.modules ?? []).flatMap((m) =>
    m.operations
      .filter((op): op is OperationSpecification & { name: string } =>
        Boolean(op.name),
      )
      .map((op) => ({
        name: op.name,
        module: m.name,
        scope: op.scope || "global",
        ...(op.description ? { description: op.description } : {}),
        ...(op.schema ? { schema: op.schema } : {}),
      })),
  );
}

/** Every action type the document accepts: the model's and the base ones. */
export function actionOperations(
  module: DocumentModelModule,
): ModelOperation[] {
  return [...modelOperations(module), ...BASE_OPERATIONS];
}

export const documentModelSummarySchema = z.object({
  type: z.string(),
  name: z.string(),
  description: z.string(),
  version: z.number().describe("Version of the latest specification"),
  modules: z.array(
    z.object({
      name: z.string(),
      operations: z.array(z.string()),
    }),
  ),
});

export type DocumentModelSummary = z.infer<typeof documentModelSummarySchema>;

/** Model name, latest version and its operation names by module. */
export function documentModelSummary(
  module: DocumentModelModule,
): DocumentModelSummary {
  const global = module.documentModel.global;
  const latest = latestSpecification(module);
  return {
    type: global.id,
    name: global.name,
    description: global.description,
    version: latest?.version ?? global.specifications.length,
    modules: (latest?.modules ?? []).map((m) => ({
      name: m.name,
      operations: m.operations
        .map((op) => op.name)
        .filter((name): name is string => Boolean(name)),
    })),
  };
}

export const operationSliceSchema = modelOperationSchema.extend({
  errors: z
    .array(z.object({ name: z.string(), description: z.string().optional() }))
    .optional(),
});

export type OperationSlice = z.infer<typeof operationSliceSchema>;

/** One operation's input schema; unknown names fail with did-you-mean. */
export function operationSchemaSlice(
  module: DocumentModelModule,
  operationName: string,
): OperationSlice {
  const operations = actionOperations(module);
  const operation = operations.find((op) => op.name === operationName);
  if (!operation) {
    throw new ReactorToolError(
      "NOT_FOUND",
      unknownValueMessage(
        "operation",
        operationName,
        operations.map((op) => op.name),
        {
          context: `for ${module.documentModel.global.id}`,
          knownLabel: "Valid action types",
        },
      ),
    );
  }
  const spec = latestSpecification(module)
    ?.modules.flatMap((m) => m.operations)
    .find((op) => op.name === operationName);
  const errors = (spec?.errors ?? [])
    .filter((e) => e.name)
    .map((e) => ({
      name: e.name as string,
      ...(e.description ? { description: e.description } : {}),
    }));
  return {
    ...presentedScope(operation),
    ...(errors.length ? { errors } : {}),
  };
}

// ANY_SCOPE is a placeholder, so agents see the default scope and a note.
function presentedScope(operation: ModelOperation): ModelOperation {
  if (operation.scope !== ANY_SCOPE) return operation;
  const note =
    "Runs in any of the document's scopes; scope defaults to global.";
  return {
    ...operation,
    scope: "global",
    description: operation.description
      ? `${operation.description}. ${note}`
      : note,
  };
}

export const stateSliceSchema = z.object({
  scope: z.string(),
  schema: z.string().describe("GraphQL SDL of the scope's state"),
  initialValue: z.string().optional(),
});

export type StateSlice = z.infer<typeof stateSliceSchema>;

/** The state schema of one scope in the latest specification. */
export function stateSchemaSlice(
  module: DocumentModelModule,
  scope: "global" | "local" = "global",
): StateSlice {
  const state = latestSpecification(module)?.state[scope];
  return {
    scope,
    schema: state?.schema ?? "",
    ...(state?.initialValue ? { initialValue: state.initialValue } : {}),
  };
}
