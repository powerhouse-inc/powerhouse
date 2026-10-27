import type {
  IReactorClient,
  ISyncManager,
  JobFailedError,
  PagingOptions,
  WriteHandle,
  WriteReceipt,
} from "@powerhousedao/reactor";
import { DriveCollectionId } from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import {
  setAvailableOffline,
  setDriveIcon,
  setDriveName,
  setSharingType,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  AuthSubject,
  DocumentModelModule,
  Operation,
  OperationOutcome,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import {
  createAction,
  creationState,
  operationOutcome,
  optionalBaseReducerCapabilities,
  stateReducerOf,
  undoNeedsTargets,
  undoRedoBatch,
} from "@powerhousedao/shared/document-model";
import {
  type CodegenStatusRegistry,
  getCodegenStatusRegistry,
} from "@powerhousedao/shared/processors";
import { pascalCase } from "change-case";
import { z } from "zod";
import { compactDocumentModelSchema } from "./compact-schema.js";
import type { ToolSchema, ToolWithCallback } from "./types.js";
import {
  createBaseAction,
  toolWithCallback,
  validateDocumentModelAction,
} from "./utils.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

/** The parameter every tool names its target document or drive by. */
const TARGET = "documentId";

const targetParam = (what: string) =>
  z.string().optional().describe(`ID or slug of the ${what}. Required.`);
const aliasParam = z.string().optional().describe(`Alias of \`${TARGET}\``);

/** The target named by `documentId` or one of its aliases; they must agree. */
function targetId(
  tool: string,
  params: Record<string, unknown>,
  aliases: string[],
): string {
  const given = new Set(
    [TARGET, ...aliases]
      .map((name) => params[name])
      .filter((id): id is string => typeof id === "string" && id !== ""),
  );
  if (given.size > 1) {
    throw new Error(
      `${tool} got different IDs in \`${TARGET}\` and its aliases (${aliases.map((a) => `\`${a}\``).join(", ")}); pass only \`${TARGET}\``,
    );
  }
  const [id] = given;
  if (!id) {
    throw new Error(`${tool} needs the target's ID in \`${TARGET}\``);
  }
  return id;
}

/** The value `addDrive` got for a field in any of its shapes; they must agree. */
function driveField<T>(
  field: string,
  values: (T | null | undefined)[],
): T | undefined {
  const given = new Set(
    values.filter((value): value is T => value != null && value !== ""),
  );
  if (given.size > 1) {
    throw new Error(
      `addDrive got different values for \`${field}\`; pass it once, at the top level`,
    );
  }
  const [value] = given;
  return value;
}

/** What became of one submitted action: its operation's index and outcome. */
type StoredOutcome = { index: number } & OperationOutcome;

type ActionError = {
  kind: "reducer-error" | "denied" | "not-applied";
  message: string;
  name?: string;
  code?: string;
};

function outcomeError(
  outcome: StoredOutcome | undefined,
  modelErrors: (
    name?: string,
    code?: string,
    message?: string,
  ) => ModelError | undefined,
): ActionError | undefined {
  if (!outcome) {
    return {
      kind: "not-applied",
      message: "The reactor stored no operation for this action",
    };
  }
  switch (outcome.kind) {
    case "applied":
      return undefined;
    case "reducer-error": {
      const known = modelErrors(outcome.name, outcome.code, outcome.message);
      const name = known?.name ?? outcome.name;
      const code = known?.code ?? outcome.code;
      return {
        kind: outcome.kind,
        message: outcome.message,
        ...(name !== undefined && { name }),
        ...(code !== undefined && { code }),
      };
    }
    case "denied":
      return { kind: outcome.kind, message: outcome.reason };
  }
}

/** An error a document model declares, as codegen names its class and code. */
type ModelError = { name: string; code: string };

/** Finds the declared error a reducer error was, by its code, class name or default message. */
function modelErrorFinder(
  module: DocumentModelModule,
  actionType: string,
): (name?: string, code?: string, message?: string) => ModelError | undefined {
  const specification = module.documentModel.global.specifications.at(-1);
  const operations = (specification?.modules ?? []).flatMap(
    (m) => m.operations,
  );
  const declared = (errors: { name: string | null; code: string | null }[]) =>
    errors.flatMap(({ name, code }) => {
      if (!name) return [];
      const className = pascalCase(name);
      return [{ name: className, code: code?.trim() || className }];
    });
  // The action's own operation first, as two operations may share a name.
  const candidates = [
    ...declared(operations.find((o) => o.name === actionType)?.errors ?? []),
    ...declared(operations.flatMap((o) => o.errors)),
  ];
  // By code, then class name (code generated before the model set one), then
  // the default message, which is the class name.
  return (name, code, message) =>
    candidates.find((e) => code !== undefined && e.code === code) ??
    candidates.find((e) => name !== undefined && e.name === name) ??
    candidates.find((e) => e.name === message);
}

/** Waits until a write can be read back. */
async function written(handle: Promise<WriteHandle>): Promise<WriteReceipt> {
  return (await handle).readable;
}

/** A job the auth policy refused at admission; such a job writes nothing. */
function isDeniedJob(error: unknown): error is JobFailedError {
  return (
    error instanceof Error &&
    error.name === "JobFailedError" &&
    (error as JobFailedError).job.error?.name === "AuthorizationDeniedError"
  );
}

export type ReactorMcpProviderOptions = {
  client: IReactorClient;
  syncManager?: ISyncManager;
  /**
   * Who the tools read as. A server shared by many callers must set it, an
   * anonymous one to an empty subject. Omitted, reads fall back to the
   * client's signer, which only a single-user local reactor should rely on.
   */
  subject?: AuthSubject;
  /** Vetra's codegen status; the process's registry by default. */
  codegenStatus?: CodegenStatusRegistry;
};

export const createDocumentTool = {
  name: "createDocument",
  description: `Create a new document.
     Unless the user specifies otherwise, and a drive named "vetra" is available, add the document to that drive by providing the drive's ID in the "driveId" parameter.
     When "driveId" is provided, the document is created and added to the drive atomically — no separate "addActions" call with "ADD_FILE" is needed.`,
  inputSchema: {
    documentType: z.string().describe("Type of the document to create"),
    name: z
      .string()
      .optional()
      .describe(
        "Optional name for the document. Used as both the document name and the drive node name when driveId is provided.",
      ),
    driveId: z
      .string()
      .optional()
      .describe(
        "Optional drive ID or slug. When provided, the document is created and added to the drive atomically.",
      ),
    parentFolder: z
      .string()
      .optional()
      .describe(
        "Optional folder ID within the drive to place the document in. Only used when driveId is provided.",
      ),
  },
  outputSchema: {
    documentId: z.string().describe("ID of the created document"),
  },
} as const satisfies ToolSchema;

export const getDocumentTool = {
  name: "getDocument",
  description: "Retrieve a document or drive by its ID, passed as `documentId`",
  inputSchema: {
    documentId: targetParam("document to retrieve"),
    id: aliasParam,
  },
  outputSchema: {
    document: z.unknown().describe("The retrieved Document"),
  },
} as const satisfies ToolSchema;

export const getDocumentsTool = {
  name: "getDocuments",
  description: "List documents in a drive, passed as `documentId`",
  inputSchema: {
    documentId: targetParam("drive whose documents to list"),
    driveId: aliasParam,
    parentId: aliasParam,
  },
  outputSchema: {
    documentIds: z.array(z.string()).describe("Array of document IDs"),
  },
} as const satisfies ToolSchema;

export const deleteDocumentTool = {
  name: "deleteDocument",
  description: "Delete a document, passed as `documentId`",
  inputSchema: {
    documentId: targetParam("document to delete"),
    id: aliasParam,
  },
  outputSchema: {
    success: z.boolean().describe("Whether the deletion was successful"),
  },
} as const satisfies ToolSchema;

type ParamAction = { type: string; input?: unknown; scope: string };

function isUndoRedo(
  action: ParamAction,
): action is ParamAction & { type: "UNDO" | "REDO" } {
  return action.type === "UNDO" || action.type === "REDO";
}

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
      .describe(
        "For a reducer-error: the error class the reducer threw, e.g. BookNotStartedError",
      ),
    code: z
      .string()
      .optional()
      .describe(
        "For a reducer-error: the error's code in the document model, e.g. BOOK_NOT_STARTED",
      ),
  })
  .describe("Present when the action was not applied");

export const addActionsTool = {
  name: "addActions",
  description:
    "Adds actions to a document. Prefer adding multiples actions at once to reduce the number of steps. Besides the document model's operations, accepts the base actions SET_NAME (scope global, input: the name), SET_PREFERRED_EDITOR (scope header, input: { preferredEditor }), UNDO and REDO (input: { count }; on base-reducer 3 each step retracts one row, counting rows added earlier in the same call) and NOOP. Returns one result per action, in input order; `success` is false when any result carries an `error`. An action its reducer rejected is stored as an operation that changes nothing, and the rest of the batch still applies. When a policy denies an action, the whole batch is refused: the denied action's error has kind `denied` and the others `not-applied`. On base-reducer 3 the call fails and writes nothing when an UNDO or REDO has nothing to retract, or when the reactor refuses one of its RETRACTs because another write changed the target first.",
  inputSchema: {
    documentId: targetParam("document or drive to change"),
    id: aliasParam,
    actions: z
      .array(
        z
          .object({
            type: z.string().describe("The name of the action"),
            input: z.unknown().describe("The payload of the action"),
            scope: z.string().describe("The scope of the action"),
            context: z
              .record(z.string(), z.unknown())
              .optional()
              .describe("Optional action context"), // TODO: Define context schema
          })
          .strict(),
      )
      .describe("Action to add to the document"),
  },
  outputSchema: {
    success: z.boolean().describe("False when any action was not applied"),
    results: z
      .array(
        z.object({
          index: z.number().describe("Position of the action in `actions`"),
          type: z.string().describe("The action's type"),
          scope: z.string().describe("The action's scope"),
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
  },
} as const satisfies ToolSchema;

// export const addOperationTool = {
//   name: "addOperation",
//   description: "Add an operation to a document",
//   inputSchema: {
//     documentId: z.string().describe("ID of the document"),
//     operation: z
//       .object({
//         type: z.string().describe("The name of the action"),
//         input: z.unknown().describe("The payload of the action"),
//         scope: z.string().describe("The scope of the action"),
//         index: z.number().describe("Position of the operation in the history"),
//         timestampUtcMs: z
//           .string()
//           .describe("Timestamp of when the operation was added"),
//         hash: z.string().describe("Hash of the resulting document data"),
//         skip: z.number().describe("The number of operations skipped"),
//         error: z
//           .string()
//           .optional()
//           .describe("Error message for a failed action"),
//         id: z.string().optional().describe("Unique operation id"),
//         context: z.object({}).optional().describe("Optional action context"), // TODO: Define context schema
//       })
//       .strict()
//       .describe("Operation to add to the document"),
//   },
//   outputSchema: {
//     result: z
//       .object({
//         status: z
//           .enum(["SUCCESS", "CONFLICT", "MISSING", "ERROR"])
//           .describe("Operation status"),
//         error: z
//           .string()
//           .optional()
//           .describe("Error details if operation failed"), // TODO: Define error schema
//         operations: z
//           .array(z.object({}))
//           .describe("Array of operations created"), // TODO: Define operation schema
//         document: z.object({}).optional().describe("Updated document"), // TODO: Define document schema
//         signals: z.array(z.object({})).describe("Array of signals generated"), // TODO: Define signal schema
//       })
//       .describe("Operation result"),
//   },
// } as const satisfies ToolSchema;

const codegenStatusSchema = z.object({
  documentId: z.string(),
  documentType: z.string(),
  name: z.string().optional().describe("The module's name"),
  state: z
    .enum([
      "queued",
      "running",
      "waiting-for-install",
      "done",
      "failed",
      "skipped",
    ])
    .describe(
      "queued: waiting for the changes to settle or for another job; running: writing code; waiting-for-install: a dependency install runs first; done: the code is written; failed: generation threw, see message; skipped: nothing was generated, see message",
    ),
  message: z
    .string()
    .optional()
    .describe("Why it failed or was skipped, or what it waits for"),
  files: z
    .array(z.string())
    .optional()
    .describe("Project files the job wrote, relative to the project"),
  updatedAt: z.string().describe("ISO timestamp of the last change"),
});

export const getCodegenStatusTool = {
  name: "getCodegenStatus",
  description:
    "Vetra's code generation for its documents (document models, editors, apps, processors, subgraphs and the package): each one's state, why it failed or was skipped, and the files it wrote. Vetra regenerates a document's code a few seconds after it changes; call this after addActions on such a document, with `waitSeconds` to wait until it settles, before reading or editing the generated code. `loadFailures` lists the project modules Vetra could not load, e.g. generated code that throws on import.",
  inputSchema: {
    documentId: z
      .string()
      .optional()
      .describe("ID of a Vetra document; omitted, every document's status"),
    waitSeconds: z
      .number()
      .min(0)
      .max(60)
      .optional()
      .describe(
        "Wait up to this many seconds for the job, or every job without `documentId`, to be done, failed or skipped. Defaults to 0.",
      ),
  },
  outputSchema: {
    active: z
      .boolean()
      .describe("False when no Vetra codegen runs on this reactor"),
    settled: z
      .boolean()
      .describe("True when every listed job is done, failed or skipped"),
    documents: z
      .array(codegenStatusSchema)
      .describe("One status per document, most recently updated first"),
    loadFailures: z
      .array(
        z.object({
          package: z.string(),
          kind: z
            .string()
            .describe('What failed to load, e.g. "document models"'),
          message: z.string(),
          updatedAt: z.string(),
        }),
      )
      .describe("Project modules that failed to load"),
    message: z.string().optional(),
  },
} as const satisfies ToolSchema;

// Drive Operation Tools

export const getDrivesTool = {
  name: "getDrives",
  description: "List all drives",
  inputSchema: {},
  outputSchema: {
    driveIds: z.array(z.string()).describe("Array of drive IDs"),
  },
} as const satisfies ToolSchema;

const driveName = z.string().optional().describe("Name of the drive");
const driveIcon = z
  .string()
  .nullable()
  .optional()
  .describe("Optional icon for the drive");
const drivePreferredEditor = z
  .string()
  .optional()
  .describe(
    "Optional app/editor module id recorded as the drive's preferred editor",
  );

export const addDriveTool = {
  name: "addDrive",
  description:
    "Create a new drive. Pass `name` and, optionally, `icon` and `preferredEditor` at the top level. The older `driveInput` object is still accepted.",
  inputSchema: {
    name: z.string().optional().describe("Name of the drive. Required."),
    icon: driveIcon,
    preferredEditor: drivePreferredEditor,
    driveInput: z
      .object({
        name: driveName,
        icon: driveIcon,
        global: z
          .object({
            name: z.string().describe("Name of the drive"),
            icon: driveIcon,
          })
          .optional()
          .describe("Global drive properties"),
        preferredEditor: drivePreferredEditor,
        local: z
          .object({
            availableOffline: z
              .boolean()
              .optional()
              .describe("Whether drive is available offline"),
            sharingType: z
              .string()
              .nullable()
              .optional()
              .describe("Sharing type"),
          })
          .optional()
          .describe("Optional local state properties"),
      })
      .optional()
      .describe(
        "Older form of the drive configuration; prefer the top-level fields",
      ),
  },
  outputSchema: {
    driveId: z.string().describe("ID of the created drive"),
  },
} as const satisfies ToolSchema;

export const getDriveTool = {
  name: "getDrive",
  description: "Get a specific drive, passed as `documentId`",
  inputSchema: {
    documentId: targetParam("drive to retrieve"),
    driveId: aliasParam,
    id: aliasParam,
    options: z
      .object({
        revisions: z
          .record(z.string(), z.number())
          .optional()
          .describe("Optional revision filter"),
        checkHashes: z.boolean().optional().describe("Whether to check hashes"),
        // TODO: Add other ReducerOptions if needed
      })
      .optional()
      .describe("Optional get document options"),
  },
  outputSchema: {
    drive: z.unknown().describe("Drive document"), // TODO: Define DocumentDriveDocument schema
  },
} as const satisfies ToolSchema;

export const deleteDriveTool = {
  name: "deleteDrive",
  description: "Delete a drive, passed as `documentId`",
  inputSchema: {
    documentId: targetParam("drive to delete"),
    driveId: aliasParam,
    id: aliasParam,
  },
  outputSchema: {
    success: z.boolean().describe("Whether the deletion was successful"),
  },
} as const satisfies ToolSchema;

export const addRemoteDriveTool = {
  name: "addRemoteDrive",
  description: "Connect to a remote drive",
  inputSchema: {
    url: z.string().describe("URL of the remote drive"),
    options: z
      .object({
        availableOffline: z
          .boolean()
          .describe("Whether drive is available offline"),
        sharingType: z.string().nullable().optional().describe("Sharing type"),
        pullFilter: z
          .object({
            branch: z
              .array(z.string())
              .nullable()
              .optional()
              .describe("Branch filter"),
            documentId: z
              .array(z.string())
              .nullable()
              .optional()
              .describe("Document ID filter"),
            documentType: z
              .array(z.string())
              .nullable()
              .optional()
              .describe("Document type filter"),
            scope: z
              .array(z.string())
              .nullable()
              .optional()
              .describe("Scope filter"),
          })
          .optional()
          .describe("Optional pull filter"),
        pullInterval: z
          .number()
          .optional()
          .describe("Pull interval in milliseconds"),
      })
      .describe("Remote drive options"),
  },
  outputSchema: {
    driveId: z.string().describe("ID of the added remote drive"),
  },
} as const satisfies ToolSchema;

export const getDocumentModelSchemaTool = {
  name: "getDocumentModelSchema",
  description:
    "Get the schema of a document model. Pass `compact: true` before addActions: it returns only each action's type, scope and GraphQL input definition, and the enums and types those inputs use. Omit it for the full model, with state schemas, descriptions, errors and examples.",
  inputSchema: {
    type: z.string().describe("Type of the document model"),
    compact: z
      .boolean()
      .optional()
      .describe(
        "Return only the actions' types, scopes and input definitions. Defaults to false.",
      ),
  },
  outputSchema: {
    schema: z.unknown().describe("Schema of the document model"),
  },
} as const satisfies ToolSchema;

export const getDocumentModelsTool = {
  name: "getDocumentModels",
  description: "Get the list of document models",
  inputSchema: {},
  outputSchema: {
    documentModels: z
      .array(
        z.object({
          name: z.string().describe("Name of the document model"),
          type: z.string().describe("Type of the document model"),
          description: z.string().describe("Description of the document model"),
          extension: z.string().describe("Extension of the document model"),
          authorName: z.string().describe("Author name of the document model"),
          authorWebsite: z
            .string()
            .describe("Author website of the document model"),
        }),
      )
      .describe("List of available document models"),
  },
} as const satisfies ToolSchema;

type ToolRecord<T extends readonly ToolSchema[]> = {
  [K in T[number]["name"]]: ToolWithCallback<Extract<T[number], { name: K }>>;
};

// All tools array for type inference
const _allTools = [
  getDocumentTool,
  createDocumentTool,
  getDocumentsTool,
  deleteDocumentTool,
  addActionsTool,
  // addOperationTool,
  getDrivesTool,
  addDriveTool,
  getDriveTool,
  deleteDriveTool,
  addRemoteDriveTool,
  getDocumentModelSchemaTool,
  getDocumentModelsTool,
  getCodegenStatusTool,
] as const;

// Inferred interface from tools
export type ReactorMcpTools = ToolRecord<typeof _allTools>;

export function createReactorMcpProvider(options: ReactorMcpProviderOptions) {
  const { client, syncManager, subject } = options;
  const view = subject ? { subject } : undefined;
  const codegen = options.codegenStatus ?? getCodegenStatusRegistry();

  /** Marks a Vetra document's codegen queued once a global change is written. */
  function codegenHint(
    document: PHDocument,
    results: { scope: string; operationIndex?: number }[],
  ): string | undefined {
    const { id, documentType } = document.header;
    if (!codegen.active || !codegen.watches(documentType)) return undefined;
    const written = results.some(
      (result) =>
        result.scope === "global" && result.operationIndex !== undefined,
    );
    if (written) {
      codegen.set({
        documentId: id,
        documentType,
        state: "queued",
        message: "Waiting for Vetra's codegen processor to pick up the change",
      });
    }
    return `Vetra generates code from this document a few seconds after a change. Call getCodegenStatus with documentId "${id}" and waitSeconds to see when it is done, and why it failed or was skipped.`;
  }

  function getDocumentModelModule(documentType: string) {
    return client.getDocumentModelModule(documentType);
  }

  /** Every stored row of one scope, through the read gate. */
  async function scopeOperations(
    documentId: string,
    scope: string,
  ): Promise<Operation[]> {
    const rows: Operation[] = [];
    let cursor = "";
    do {
      const page = await client.getOperations(
        documentId,
        { ...view, branch: "main", scopes: [scope] },
        undefined,
        { cursor, limit: 500 },
      );
      rows.push(...page.results);
      cursor = page.nextCursor ?? "";
    } while (cursor);
    return rows;
  }

  /** Names the denied actions of a refused batch; the others were not written either. */
  async function denialErrors(
    documentId: string,
    actions: Action[],
    message: string,
  ): Promise<ActionError[]> {
    const notApplied: ActionError = {
      kind: "not-applied",
      message: `The batch was refused, so nothing in it was written: ${message}`,
    };
    try {
      const { evaluations } = await client.evaluateActions(
        documentId,
        "main",
        actions.map(({ scope, type, input }) => ({ scope, type, input })),
      );
      return evaluations.map((evaluation) =>
        evaluation.decision === "deny"
          ? { kind: "denied", message: evaluation.reason }
          : notApplied,
      );
    } catch {
      return actions.map(() => notApplied);
    }
  }

  /** For clients whose jobs carry no result: reads the operations the write appended. */
  async function readOutcomes(
    documentId: string,
    before: PHDocument,
    actions: Action[],
  ): Promise<Map<string, StoredOutcome>> {
    const ids = new Set(actions.map((action) => action.id));
    const outcomes = new Map<string, StoredOutcome>();
    for (const scope of new Set(actions.map((action) => action.scope))) {
      let paging: PagingOptions | undefined;
      do {
        const page = await client.getOperations(
          documentId,
          { ...view, branch: "main", scopes: [scope] },
          { sinceRevision: before.header.revision[scope] ?? 0 },
          paging,
        );
        for (const operation of page.results) {
          if (ids.has(operation.action.id)) {
            outcomes.set(operation.action.id, {
              index: operation.index,
              ...operationOutcome(operation),
            });
          }
        }
        paging =
          page.nextCursor && page.results.length
            ? { cursor: page.nextCursor, limit: page.options.limit }
            : undefined;
      } while (paging);
    }
    return outcomes;
  }

  const tools = {
    getDocument: toolWithCallback(getDocumentTool, async (params) => {
      const id = targetId("getDocument", params, ["id"]);
      const document = await client.get<PHDocument>(id, view);
      return { document: { header: document.header, state: document.state } };
    }),

    createDocument: toolWithCallback(createDocumentTool, async (params) => {
      if (params.driveId) {
        const document = await client.newDocument(params.documentType, {
          parentIdentifier: params.driveId,
          name: params.name || undefined,
        });
        const created = await client.drives.addFile(
          params.driveId,
          document,
          params.parentFolder,
        );
        return { documentId: created.header.id };
      }

      const created = await written(
        client.write.createEmpty(params.documentType, {}),
      );
      return { documentId: created.documentId };
    }),

    getDocuments: toolWithCallback(getDocumentsTool, async (params) => {
      const driveId = targetId("getDocuments", params, ["driveId", "parentId"]);
      const result = await client.getOutgoingRelationships(
        driveId,
        "child",
        view,
      );
      const documentIds = result.results.map((doc) => doc.header.id);
      return { documentIds };
    }),

    deleteDocument: toolWithCallback(deleteDocumentTool, async (params) => {
      const documentId = targetId("deleteDocument", params, ["id"]);
      try {
        // Routes the delete through the drive; nothing read here is returned.
        const incoming = await client.getIncomingRelationships(
          documentId,
          "child",
        );
        const driveParent = incoming.results.find(
          (p) => p.header.documentType === DRIVE_DOCUMENT_TYPE,
        );
        if (driveParent) {
          await client.drives.removeNode(driveParent.header.id, documentId);
        } else {
          await written(client.write.deleteDocument(documentId));
        }
        return { success: true };
      } catch {
        return { success: false };
      }
    }),

    addActions: toolWithCallback(addActionsTool, async (params) => {
      const documentId = targetId("addActions", params, ["id"]);
      const document = await client.get<PHDocument>(documentId, view);
      const documentModel = await getDocumentModelModule(
        document.header.documentType,
      );
      if (!documentModel) {
        throw new Error(
          `Document model for document type '${document.header.documentType}' not found`,
        );
      }
      const buildAction = (paramAction: ParamAction): Action => {
        const baseAction = createBaseAction(
          paramAction.type,
          paramAction.input,
          paramAction.scope,
        );
        if (baseAction) {
          if (!baseAction.action) {
            throw new Error(
              `Invalid action ${JSON.stringify(paramAction)}: ${baseAction.errors.join(", ")}`,
            );
          }
          return baseAction.action;
        }
        const action: Action = createAction(
          paramAction.type,
          paramAction.input ?? {},
          undefined,
          undefined,
          paramAction.scope,
        );
        const actionValidation = validateDocumentModelAction(
          documentModel,
          action,
        );
        if (!actionValidation.isValid) {
          throw new Error(
            `Invalid action ${JSON.stringify(action)}: ${actionValidation.errors.join(", ")}`,
          );
        }
        return action;
      };

      const caps = optionalBaseReducerCapabilities(document.header);
      const undoSteps = params.actions.filter(isUndoRedo);
      for (const step of undoSteps) {
        const { count } = buildAction(step).input as { count: number };
        if (!Number.isInteger(count) || count < 1) {
          throw new Error(
            `Invalid action ${JSON.stringify(step)}: count must be a positive integer`,
          );
        }
      }
      let actions: Action[];
      // The position in `params.actions` each submitted action came from.
      let sources: number[];
      if (caps === undefined || !undoNeedsTargets(caps) || !undoSteps.length) {
        actions = params.actions.map(buildAction);
        sources = actions.map((_, index) => index);
      } else {
        // Each step retracts a target resolved over the stored rows and the earlier actions.
        const reducer = stateReducerOf(documentModel.reducer);
        if (reducer === undefined) {
          throw new Error(
            `Document model ${document.header.documentType} has no state reducer to resolve undo targets with`,
          );
        }
        const operations: Record<string, Operation[]> = {};
        for (const scope of new Set(undoSteps.map((step) => step.scope))) {
          operations[scope] = await scopeOperations(documentId, scope);
        }
        // The served document's initialState is its head state; a scope re-derives from creation.
        const initialState =
          creationState(await scopeOperations(documentId, "document")) ??
          (documentModel.utils.createDocument() as PHDocument).initialState;
        const batch = undoRedoBatch(
          { ...document, initialState, operations },
          caps,
          reducer,
        );
        sources = [];
        for (const [index, paramAction] of params.actions.entries()) {
          const before = batch.actions.length;
          if (isUndoRedo(paramAction)) {
            const { count } = buildAction(paramAction).input as {
              count: number;
            };
            for (let i = 0; i < count; i++) {
              batch.undoOrRedo(paramAction.type, paramAction.scope);
            }
          } else {
            batch.add(buildAction(paramAction));
          }
          for (let i = before; i < batch.actions.length; i++) {
            sources.push(index);
          }
        }
        actions = [...batch.actions];
      }

      const handle = await client.write.execute(documentId, "main", actions);
      let results: {
        index: number;
        type: string;
        scope: string;
        operationIndex?: number;
        error?: ActionError;
      }[];
      try {
        const receipt = await handle.readable;
        const outcomes = receipt.job.result
          ? new Map(receipt.job.result.actions.map((a) => [a.actionId, a]))
          : await readOutcomes(receipt.documentId, document, actions);
        results = actions.map((action, index) => {
          const outcome = outcomes.get(action.id);
          const error = outcomeError(
            outcome,
            modelErrorFinder(documentModel, action.type),
          );
          return {
            index,
            type: action.type,
            scope: action.scope,
            ...(outcome && { operationIndex: outcome.index }),
            ...(error && { error }),
          };
        });
      } catch (error) {
        if (!isDeniedJob(error)) throw error;
        const errors = await denialErrors(documentId, actions, error.message);
        results = actions.map((action, index) => ({
          index,
          type: action.type,
          scope: action.scope,
          error: errors[index],
        }));
      }
      const hint = codegenHint(document, results);
      // A counted UNDO or REDO is submitted as one action per step; it reports once.
      const reported = params.actions.map((paramAction, index) => {
        const steps = results.filter(
          (result) => sources[result.index] === index,
        );
        const operationIndex = steps.at(-1)?.operationIndex;
        const error =
          steps.find((step) => step.error?.kind === "denied")?.error ??
          steps.find((step) => step.error)?.error;
        return {
          index,
          type: paramAction.type,
          scope: paramAction.scope,
          ...(operationIndex !== undefined && { operationIndex }),
          ...(error && { error }),
        };
      });
      return {
        success: reported.every((result) => !result.error),
        results: reported,
        ...(hint && { codegen: hint }),
      };
    }),

    // Drive operation implementations
    getDrives: toolWithCallback(getDrivesTool, async () => {
      // Find all documents of type "powerhouse/document-drive"
      const result = await client.find({ type: DRIVE_DOCUMENT_TYPE }, view);
      const driveIds = result.results.map((doc: PHDocument) => doc.header.id);
      return { driveIds };
    }),

    addDrive: toolWithCallback(addDriveTool, async (params) => {
      const { driveInput } = params;
      const name = driveField("name", [
        params.name,
        driveInput?.name,
        driveInput?.global?.name,
      ]);
      if (!name) {
        throw new Error("addDrive needs the drive's `name`");
      }
      const icon = driveField("icon", [
        params.icon,
        driveInput?.icon,
        driveInput?.global?.icon,
      ]);
      const preferredEditor = driveField("preferredEditor", [
        params.preferredEditor,
        driveInput?.preferredEditor,
      ]);

      const { documentId: driveId } = await written(
        client.write.createEmpty(DRIVE_DOCUMENT_TYPE, {}),
      );

      // Before the rename, so reactors without the document-view name fix keep it.
      if (preferredEditor) {
        await written(
          client.write.setPreferredEditor(driveId, preferredEditor),
        );
      }
      await written(client.write.rename(driveId, name));

      const actions: Action[] = [setDriveName({ name })];
      if (icon) {
        actions.push(setDriveIcon({ icon }));
      }
      if (driveInput?.local?.sharingType) {
        actions.push(setSharingType({ type: driveInput.local.sharingType }));
      }
      if (driveInput?.local?.availableOffline !== undefined) {
        actions.push(
          setAvailableOffline({
            availableOffline: driveInput.local.availableOffline,
          }),
        );
      }
      await written(client.write.execute(driveId, "main", actions));

      return { driveId };
    }),

    getDrive: toolWithCallback(getDriveTool, async (params) => {
      const driveId = targetId("getDrive", params, ["driveId", "id"]);
      const drive = await client.get<DocumentDriveDocument>(driveId, view);
      return { drive: { header: drive.header, state: drive.state } };
    }),

    deleteDrive: toolWithCallback(deleteDriveTool, async (params) => {
      const driveId = targetId("deleteDrive", params, ["driveId", "id"]);
      try {
        // Use CASCADE to delete the drive and all its contents
        await written(client.write.deleteDocument(driveId));
        return { success: true };
      } catch {
        return { success: false };
      }
    }),

    addRemoteDrive: toolWithCallback(addRemoteDriveTool, async (params) => {
      if (!syncManager) {
        throw new Error(
          "Remote drive management is not available. " +
            "SyncManager was not configured for this MCP server.",
        );
      }

      // Fetch drive info from the REST endpoint to get both id and graphqlEndpoint
      const response = await fetch(params.url);
      if (!response.ok) {
        throw new Error(`Failed to resolve drive info from ${params.url}`);
      }
      const driveInfo = (await response.json()) as {
        id: string;
        graphqlEndpoint: string;
      };

      const resolvedDriveId = driveInfo.id;
      const collectionId = DriveCollectionId.forDrive(resolvedDriveId);

      // Check if remote already exists
      const existingRemote = syncManager
        .list()
        .find((remote) => remote.meta.collectionId.equals(collectionId));
      if (existingRemote) {
        return { driveId: resolvedDriveId };
      }

      // Add the remote via SyncManager
      const remoteName = `mcp-remote-${crypto.randomUUID()}`;
      await syncManager.add(remoteName, collectionId, {
        type: "gql",
        parameters: {
          url: driveInfo.graphqlEndpoint,
        },
      });

      return { driveId: resolvedDriveId };
    }),

    getDocumentModels: toolWithCallback(getDocumentModelsTool, async () => {
      const result = await client.getDocumentModelModules();
      return {
        documentModels: result.results.map((model: DocumentModelModule) => {
          const schemaGlobal = model.documentModel.global;
          return {
            name: schemaGlobal.name,
            type: schemaGlobal.id,
            description: schemaGlobal.description,
            extension: schemaGlobal.extension,
            authorName: schemaGlobal.author.name,
            authorWebsite: schemaGlobal.author.website ?? "",
          };
        }),
      };
    }),

    getCodegenStatus: toolWithCallback(getCodegenStatusTool, async (params) => {
      if (!codegen.active) {
        return {
          active: false,
          settled: true,
          documents: [],
          loadFailures: codegen.loadFailures(),
          message:
            "No Vetra codegen runs on this reactor; `ph vetra` runs it for the project's Vetra drive",
        };
      }
      let documentId = params.documentId;
      if (documentId !== undefined && !codegen.get(documentId)) {
        // A slug names the document as well as its ID.
        try {
          documentId = (await client.get<PHDocument>(documentId, view)).header
            .id;
        } catch {
          // Reported below as a document without a status.
        }
      }
      const waitMs = (params.waitSeconds ?? 0) * 1000;
      const settled =
        waitMs > 0
          ? await codegen.waitUntilSettled(documentId, waitMs)
          : codegen.settled(documentId);
      const documents =
        documentId === undefined
          ? codegen.list()
          : [codegen.get(documentId)].filter((status) => status !== undefined);
      return {
        active: true,
        settled,
        documents,
        loadFailures: codegen.loadFailures(),
        ...(documentId !== undefined &&
          documents.length === 0 && {
            message: `No codegen recorded for ${params.documentId}. Vetra generates code for documents of type ${codegen.documentTypes.join(", ")} in its drive, once they change.`,
          }),
      };
    }),

    getDocumentModelSchema: toolWithCallback(
      getDocumentModelSchemaTool,
      async (params) => {
        const documentModel = await getDocumentModelModule(params.type);
        const schema = documentModel?.documentModel.global;
        if (!schema) {
          throw new Error(`Document model '${params.type}' not found`);
        }
        return {
          schema: params.compact ? compactDocumentModelSchema(schema) : schema,
        };
      },
    ),
  } as const;

  const resources = {};

  const prompts = {};

  return Promise.resolve({
    tools,
    resources,
    prompts,
  } as const);
}
