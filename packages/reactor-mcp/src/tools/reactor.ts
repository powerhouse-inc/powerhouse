import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { CodegenStatusRegistry } from "@powerhousedao/shared/processors";
import { z } from "zod";
import { codegenHint } from "./codegen.js";
import {
  compactDocumentModelSchema,
  compactDocumentModelSchemaSchema,
} from "./compact-schema.js";
import { defineTool } from "./definition.js";
import {
  documentSummary,
  documentSummarySchema,
  documentView,
  documentViewSchema,
  DRIVE_DOCUMENT_TYPE,
} from "./documents.js";
import { ReactorToolError, toReactorToolError } from "./errors.js";
import { applyJsonPath, JsonPathError } from "./jsonpath.js";
import {
  createDocument,
  deleteDocument,
  executeActions,
  getDocument,
  getDocumentModel,
} from "./operations.js";
import {
  documentModelInfo,
  documentModelInfoSchema,
  documentModelSummary,
  documentModelSummarySchema,
  latestSpecification,
  operationSchemaSlice,
  operationSliceSchema,
  stateSchemaSlice,
  stateSliceSchema,
} from "./schema.js";
import { actionInputSchema } from "./validation.js";

const MAX_LISTED = 500;

type Paged<T> = { results: T[]; next?: () => Promise<Paged<T>> };

async function collect<T>(first: Promise<Paged<T>>): Promise<T[]> {
  let page = await first.catch((error: unknown) => {
    throw toReactorToolError(error);
  });
  const out: T[] = [];
  for (;;) {
    out.push(...page.results);
    if (out.length >= MAX_LISTED || !page.next || page.results.length === 0) {
      break;
    }
    page = await page.next();
  }
  return out.slice(0, MAX_LISTED);
}

const filterSchema = z
  .string()
  .optional()
  .describe(
    "JSONPath over the document state, e.g. $.global.items[?(@.status=='OPEN')] or $.global.items[-1]",
  );

/** The parameter every tool names its target document or drive by. */
const TARGET = "documentId";

const targetParam = (what: string) =>
  z.string().optional().describe(`ID or slug of the ${what}. Required.`);
const aliasParam = z.string().optional().describe(`Alias of \`${TARGET}\``);

/** The target named by `documentId` or one of its aliases; they must agree. */
export function targetId(
  tool: string,
  args: Record<string, unknown>,
  aliases: readonly string[],
): string {
  const given = new Set(
    [TARGET, ...aliases]
      .map((name) => args[name])
      .filter((id): id is string => typeof id === "string" && id !== ""),
  );
  if (given.size > 1) {
    throw new ReactorToolError(
      "INVALID_ACTION",
      `${tool} got different IDs in \`${TARGET}\` and its aliases (${aliases.map((a) => `\`${a}\``).join(", ")}); pass only \`${TARGET}\``,
    );
  }
  const [id] = given;
  if (!id) {
    throw new ReactorToolError(
      "INVALID_ACTION",
      `${tool} needs the target's ID in \`${TARGET}\``,
    );
  }
  return id;
}

export { aliasParam, targetParam };

const revisionSchema = z
  .record(z.string(), z.number())
  .describe("Revision per scope after the change");

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
};

export const getDocumentModelsTool = defineTool({
  name: "getDocumentModels",
  title: "List document models",
  description:
    "List the document model types this reactor can create and edit.",
  inputSchema: z.object({}),
  outputSchema: z.object({ documentModels: z.array(documentModelInfoSchema) }),
  annotations: readOnly,
  async execute(_args, { client, signal }) {
    const modules = await collect(
      client.getDocumentModelModules(undefined, undefined, signal),
    );
    return { documentModels: modules.map(documentModelInfo) };
  },
});

export const getDocumentModelSchemaTool = defineTool({
  name: "getDocumentModelSchema",
  title: "Read a document model schema",
  description: `Read a document model's schema. Without options it returns the operation names per module.
Pass "compact" before addActions for every action's type, scope and input definition, and the types those inputs use.
Pass "operation" for one action's input schema (GraphQL SDL), "state" for a state schema, or "filter" for a JSONPath over the latest specification.`,
  inputSchema: z.object({
    type: z
      .string()
      .describe("Document model type, e.g. powerhouse/document-model"),
    compact: z
      .boolean()
      .optional()
      .describe("Return every action's type, scope and input definition"),
    operation: z
      .string()
      .optional()
      .describe(
        "Action type whose input schema to return, e.g. SET_MODEL_NAME",
      ),
    state: z
      .enum(["global", "local"])
      .optional()
      .describe("Scope whose state schema to return"),
    filter: z
      .string()
      .optional()
      .describe(
        "JSONPath over the latest specification, e.g. $.modules[*].name",
      ),
  }),
  outputSchema: z.object({
    type: z.string(),
    model: documentModelSummarySchema.optional(),
    compact: compactDocumentModelSchemaSchema.optional(),
    operation: operationSliceSchema.optional(),
    state: stateSliceSchema.optional(),
    value: z.unknown().optional().describe("The filter's match"),
  }),
  annotations: readOnly,
  async execute(args, { client, signal }) {
    const module = await getDocumentModel(client, args.type, signal);
    const type = module.documentModel.global.id;
    if (args.compact) {
      return {
        type,
        compact: compactDocumentModelSchema(module.documentModel.global),
      };
    }
    if (!args.operation && !args.state && !args.filter) {
      return { type, model: documentModelSummary(module) };
    }
    let value: unknown;
    if (args.filter) {
      try {
        value = applyJsonPath(latestSpecification(module), args.filter);
      } catch (error) {
        if (error instanceof JsonPathError) {
          throw new ReactorToolError("INVALID_ACTION", error.message);
        }
        throw error;
      }
    }
    return {
      type,
      ...(args.operation
        ? { operation: operationSchemaSlice(module, args.operation) }
        : {}),
      ...(args.state ? { state: stateSchemaSlice(module, args.state) } : {}),
      ...(args.filter ? { value } : {}),
    };
  },
});

export const getDocumentTool = defineTool({
  name: "getDocument",
  title: "Read a document",
  description:
    "Read a document by id or slug: header essentials and its global and local state. Long arrays and strings are cut; pass a filter to read a part in full (up to 100,000 characters).",
  inputSchema: z.object({
    documentId: targetParam("document to read"),
    id: aliasParam,
    filter: filterSchema,
  }),
  outputSchema: z.object({ document: documentViewSchema }),
  annotations: readOnly,
  async execute(args, { client, signal }) {
    const id = targetId("getDocument", args, ["id"]);
    const document = await getDocument(client, id, signal);
    return { document: documentView(document, { filter: args.filter }) };
  },
});

export const getDocumentsTool = defineTool({
  name: "getDocuments",
  title: "List a drive's documents",
  description:
    "List the documents in a drive (its children): id, type and name.",
  inputSchema: z.object({
    documentId: targetParam("drive whose documents to list"),
    driveId: aliasParam,
    parentId: aliasParam,
  }),
  outputSchema: z.object({ documents: z.array(documentSummarySchema) }),
  annotations: readOnly,
  async execute(args, { client, signal }) {
    const driveId = targetId("getDocuments", args, ["driveId", "parentId"]);
    const children = await collect(
      client.getOutgoingRelationships(
        driveId,
        "child",
        undefined,
        undefined,
        signal,
      ),
    );
    return { documents: children.map(documentSummary) };
  },
});

export const getDrivesTool = defineTool({
  name: "getDrives",
  title: "List drives",
  description: "List the drives: id, type and name.",
  inputSchema: z.object({}),
  outputSchema: z.object({ drives: z.array(documentSummarySchema) }),
  annotations: readOnly,
  async execute(_args, { client, signal }) {
    const drives = await collect(
      client.find({ type: DRIVE_DOCUMENT_TYPE }, undefined, undefined, signal),
    );
    return { drives: drives.map(documentSummary) };
  },
});

export const getDriveTool = defineTool({
  name: "getDrive",
  title: "Read a drive",
  description:
    "Read a drive by id or slug, including its folder and file nodes. Pass a filter such as $.global.nodes[?(@.kind=='file')] to narrow it.",
  inputSchema: z.object({
    documentId: targetParam("drive to read"),
    driveId: aliasParam,
    id: aliasParam,
    filter: filterSchema,
  }),
  outputSchema: z.object({ drive: documentViewSchema }),
  annotations: readOnly,
  async execute(args, { client, signal }) {
    const driveId = targetId("getDrive", args, ["driveId", "id"]);
    const drive = await getDocument<PHDocument>(client, driveId, signal);
    return { drive: documentView(drive, { filter: args.filter }) };
  },
});

export const createDocumentTool = defineTool({
  name: "createDocument",
  title: "Create a document",
  description: `Create a document, optionally inside a drive.
With "driveId" the document is added to the drive as a file, so no separate ADD_FILE is needed.`,
  inputSchema: z.object({
    documentType: z.string().describe("Document model type"),
    name: z
      .string()
      .optional()
      .describe("Document name, also the drive file's name"),
    driveId: z
      .string()
      .optional()
      .describe("Drive id or slug to create the document in"),
    parentFolder: z
      .string()
      .optional()
      .describe("Folder id within the drive; only with driveId"),
  }),
  outputSchema: z.object({
    documentId: z.string(),
    documentType: z.string(),
    name: z.string(),
    driveId: z.string().optional(),
    revision: revisionSchema,
  }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    openWorldHint: false,
  },
  async execute(args, { client, signal }) {
    return createDocument(client, args, signal);
  },
});

export const deleteDocumentTool = defineTool({
  name: "deleteDocument",
  title: "Delete a document",
  description: "Delete a document, removing it from its drive first.",
  inputSchema: z.object({
    documentId: targetParam("document to delete"),
    id: aliasParam,
  }),
  outputSchema: z.object({ documentId: z.string() }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    openWorldHint: false,
  },
  async execute(args, { client, signal }) {
    const id = targetId("deleteDocument", args, ["id"]);
    return deleteDocument(client, id, signal);
  },
});

const actionErrorSchema = z
  .object({
    kind: z
      .enum(["reducer-error", "denied", "not-applied"])
      .describe(
        "reducer-error: the reducer threw; denied: an auth policy refused it; not-applied: it was not written, e.g. because another action of the batch was denied",
      ),
    message: z.string().describe("Why the action was not applied"),
    name: z
      .string()
      .optional()
      .describe("For a reducer-error: the error class the reducer threw"),
    code: z
      .string()
      .optional()
      .describe("For a reducer-error: the error's code in the document model"),
  })
  .describe("Present when the action was not applied");

export type ReactorToolsOptions = {
  /** Action types `addActions` may send; others fail as FORBIDDEN. */
  allowedActionTypes?: readonly string[];
  /** Vetra's codegen status; `addActions` then says how to follow generation. */
  codegenStatus?: CodegenStatusRegistry;
};

export function createAddActionsTool(options: ReactorToolsOptions = {}) {
  const allowed = options.allowedActionTypes;
  return defineTool({
    name: "addActions",
    title: "Change a document",
    description: `Apply actions to a document as one batch. Send several actions in one call rather than one call each.
Besides the model's operations it accepts the base actions SET_NAME, SET_PREFERRED_EDITOR, UNDO, REDO and NOOP.
Every action is validated first; on a validation failure nothing is applied and each failed action is listed.
Returns one result per action, in input order; "success" is false when any result has an "error". An action its reducer rejected is stored as an operation that changes nothing, and the rest of the batch still applies. When a policy denies an action, the whole batch is refused.${
      allowed ? `\nAllowed action types: ${allowed.join(", ")}.` : ""
    }`,
    inputSchema: z.object({
      documentId: targetParam("document or drive to change"),
      id: aliasParam,
      actions: z
        .array(actionInputSchema)
        .min(1)
        .describe("Actions to apply, in order"),
    }),
    outputSchema: z.object({
      documentId: z.string(),
      revision: revisionSchema,
      success: z.boolean().describe("False when any action was not applied"),
      results: z
        .array(
          z.object({
            index: z.number().describe("Position of the action in `actions`"),
            type: z.string(),
            scope: z.string(),
            operationIndex: z
              .number()
              .optional()
              .describe("Index of the operation the action was stored as"),
            error: actionErrorSchema.optional(),
          }),
        )
        .describe("One result per action, in the order they were given"),
      codegen: z
        .string()
        .optional()
        .describe(
          "Present when Vetra generates code from this document: how to follow that generation",
        ),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: true,
      openWorldHint: false,
    },
    async execute(args, { client, signal }) {
      const id = targetId("addActions", args, ["id"]);
      const executed = await executeActions(client, id, args.actions, {
        allowedActionTypes: allowed,
        signal,
      });
      const codegen =
        options.codegenStatus &&
        (await codegenHint(options.codegenStatus, client, executed, signal));
      return { ...executed, ...(codegen && { codegen }) };
    },
  });
}

export const addActionsTool = createAddActionsTool();

/** The tools every host mounts: reads, document create/delete and `addActions`. */
export function reactorTools(options: ReactorToolsOptions = {}) {
  return [
    getDocumentModelsTool,
    getDocumentModelSchemaTool,
    getDrivesTool,
    getDriveTool,
    getDocumentsTool,
    getDocumentTool,
    createDocumentTool,
    options.allowedActionTypes || options.codegenStatus
      ? createAddActionsTool(options)
      : addActionsTool,
    deleteDocumentTool,
  ] as const;
}

export type ReactorTool = ReturnType<typeof reactorTools>[number];
