import type { IDocumentDriveServer } from "document-drive";
import { type DocumentModelState, generateId } from "document-model";
import { DocumentModelStateSchema } from "document-model/document-model/gen/schema/zod";
import { z } from "zod";
import type { ToolSchema, ToolWithCallback } from "./types.js";
import { toolWithCallback, validateDocumentModelAction } from "./utils.js";

export const createDocumentTool = {
  name: "createDocument",
  description: `Create a new document.
     Unless the user specifies otherwise, and a drive named "vetra" is available, add the document after creating it to that drive using "addActions" tool with a "ADD_FILE" action to the drive document.`,
  inputSchema: {
    documentType: z.string().describe("Type of the document to create"),
    documentId: z.string().optional().describe("Optional ID for the document"),
  },
  outputSchema: {
    documentId: z.string().describe("ID of the created document"),
  },
} as const satisfies ToolSchema;

export const getDocumentTool = {
  name: "getDocument",
  description: "Retrieve a document by its ID",
  inputSchema: {
    id: z.string().describe("ID of the document to retrieve"),
  },
  outputSchema: {
    document: z.object({}).describe("The retrieved Document"),
  },
} as const satisfies ToolSchema;

export const getDocumentsTool = {
  name: "getDocuments",
  description: "List documents in a drive",
  inputSchema: {
    parentId: z.string().describe("ID of the drive"),
  },
  outputSchema: {
    documentIds: z.array(z.string()).describe("Array of document IDs"),
  },
} as const satisfies ToolSchema;

export const deleteDocumentTool = {
  name: "deleteDocument",
  description: "Delete a document",
  inputSchema: {
    documentId: z.string().describe("ID of the document to delete"),
  },
  outputSchema: {
    success: z.boolean().describe("Whether the deletion was successful"),
  },
} as const satisfies ToolSchema;

export const addActionsTool = {
  name: "addActions",
  description:
    "Adds actions to a document. Prefer adding multiples actions at once to reduce the number of steps.",
  inputSchema: {
    documentId: z.string().describe("ID of the document"),
    actions: z
      .array(
        z
          .object({
            type: z.string().describe("The name of the action"),
            input: z.unknown().describe("The payload of the action"),
            scope: z.string().describe("The scope of the action"),
            context: z
              .object({})
              .optional()
              .describe("Optional action context"), // TODO: Define context schema
          })
          .strict(),
      )
      .describe("Action to add to the document"),
  },
  outputSchema: {
    success: z.boolean().describe("Whether the actions were added"),
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

// Drive Operation Tools

export const getDrivesTool = {
  name: "getDrives",
  description: "List all drives",
  inputSchema: {},
  outputSchema: {
    driveIds: z.array(z.string()).describe("Array of drive IDs"),
  },
} as const satisfies ToolSchema;

export const addDriveTool = {
  name: "addDrive",
  description: "Create a new drive",
  inputSchema: {
    driveInput: z
      .object({
        global: z
          .object({
            name: z.string().describe("Name of the drive"),
            icon: z
              .string()
              .nullable()
              .optional()
              .describe("Optional icon for the drive"),
          })
          .describe("Global drive properties"),
        id: z.string().optional().describe("Optional drive ID"),
        slug: z.string().optional().describe("Optional drive slug"),
        preferredEditor: z
          .string()
          .optional()
          .describe("Optional preferred editor"),
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
      .describe("Drive configuration"),
  },
  outputSchema: {
    driveId: z.string().describe("ID of the created drive"),
  },
} as const satisfies ToolSchema;

export const getDriveTool = {
  name: "getDrive",
  description: "Get a specific drive",
  inputSchema: {
    driveId: z.string().describe("ID of the drive to retrieve"),
    options: z
      .object({
        revisions: z
          .record(z.number())
          .optional()
          .describe("Optional revision filter"),
        checkHashes: z.boolean().optional().describe("Whether to check hashes"),
        // TODO: Add other ReducerOptions if needed
      })
      .optional()
      .describe("Optional get document options"),
  },
  outputSchema: {
    drive: z.object({}).describe("Drive document"), // TODO: Define DocumentDriveDocument schema
  },
} as const satisfies ToolSchema;

export const deleteDriveTool = {
  name: "deleteDrive",
  description: "Delete a drive",
  inputSchema: {
    driveId: z.string().describe("ID of the drive to delete"),
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

type Properties<T> = Required<{
  [K in keyof T]: z.ZodType<T[K], any, T[K]>;
}>;

export const getDocumentModelSchemaTool = {
  name: "getDocumentModelSchema",
  description: "Get the schema of a document model",
  inputSchema: {
    type: z.string().describe("Type of the document model"),
  },
  outputSchema: {
    schema: DocumentModelStateSchema().describe(
      "Schema of the document model",
    ) as z.ZodObject<Properties<DocumentModelState>>,
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
const allTools = [
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
] as const;

// Inferred interface from tools
export type ReactorMcpTools = ToolRecord<typeof allTools>;

export async function createReactorMcpProvider(reactor: IDocumentDriveServer) {
  await reactor.initialize();

  function getDocumentModelModule(documentType: string) {
    const documentModels = reactor.getDocumentModelModules();
    const documentModel = documentModels.find(
      (model) => model.documentModel.id === documentType,
    );
    return documentModel;
  }

  const tools = {
    getDocument: toolWithCallback(getDocumentTool, async (params) => {
      const { header, state } = await reactor.getDocument(params.id);
      return { document: { header, state } };
    }),

    createDocument: toolWithCallback(createDocumentTool, async (params) => {
      // Create document input based on provided parameters
      const createInput = {
        documentType: params.documentType,
        id: params.documentId ?? generateId(),
      };

      const result = await reactor.queueDocument(createInput);
      if (result.status !== "SUCCESS") {
        throw new Error(`${result.status}: ${result.error?.message}`);
      }

      if (!result.document?.header.id) {
        throw new Error("Created document doesn't have an Id");
      }
      return {
        documentId: result.document.header.id,
      };
    }),

    getDocuments: toolWithCallback(getDocumentsTool, async (params) => {
      const documentIds = await reactor.getDocuments(params.parentId);
      return { documentIds };
    }),

    deleteDocument: toolWithCallback(deleteDocumentTool, async (params) => {
      try {
        await reactor.deleteDocument(params.documentId);
        return { success: true };
      } catch {
        return { success: false };
      }
    }),

    addActions: toolWithCallback(addActionsTool, async (params) => {
      const document = await reactor.getDocument(params.documentId);
      const documentModel = getDocumentModelModule(
        document.header.documentType,
      );
      if (!documentModel) {
        throw new Error(
          `Document model for document type '${document.header.documentType}' not found`,
        );
      }
      const actions = params.actions.map((paramAction) => {
        const action = {
          id: generateId(),
          timestampUtcMs: new Date().toISOString(),
          ...paramAction,
          input: paramAction.input ?? {},
        };
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
      });

      const result = await reactor.addActions(params.documentId, actions);

      if (result.status !== "SUCCESS") {
        throw new Error(`${result.status}: ${result.error?.message}`);
      }
      const operationErrors = result.operations
        .filter((operation) => operation.error !== undefined)
        .map((operation) => ({
          type: operation.action.type,
          input: operation.action.input,
          error: operation.error,
        }));
      if (operationErrors.length > 0) {
        throw new Error(
          `Some of the actions failed: ${JSON.stringify(operationErrors)}`,
        );
      }
      return {
        success: true,
      };
    }),

    // addOperation: toolWithCallback(addOperationTool, async (params) => {
    //   const result = await reactor.addOperation(params.documentId, {
    //     ...params.operation,
    //     input: params.operation.input ?? {},
    //   });
    //   return {
    //     result: {
    //       ...result,
    //       error:
    //         typeof result.error === "string"
    //           ? result.error
    //           : result.error?.message,
    //     },
    //   };
    // }),

    // Drive operation implementations
    getDrives: toolWithCallback(getDrivesTool, async () => {
      const driveIds = await reactor.getDrives();
      return { driveIds };
    }),

    addDrive: toolWithCallback(addDriveTool, async (params) => {
      // Extract preferredEditor and create proper DriveInput
      const { preferredEditor, ...driveInput } = params.driveInput;
      const result = await reactor.addDrive(driveInput, preferredEditor);
      return { driveId: result.header.id };
    }),

    getDrive: toolWithCallback(getDriveTool, async (params) => {
      const { header, state } = await reactor.getDrive(
        params.driveId,
        params.options,
      );
      return { drive: { header, state } };
    }),

    deleteDrive: toolWithCallback(deleteDriveTool, async (params) => {
      try {
        await reactor.deleteDrive(params.driveId);
        return { success: true };
      } catch {
        return { success: false };
      }
    }),

    addRemoteDrive: toolWithCallback(addRemoteDriveTool, async (params) => {
      const { sharingType, pullFilter, ...restOptions } = params.options;
      const drive = await reactor.addRemoteDrive(params.url, {
        ...restOptions,
        listeners: [],
        triggers: [],
        sharingType: sharingType ?? null,
        ...(pullFilter && {
          pullFilter: {
            branch: pullFilter.branch === undefined ? [] : pullFilter.branch,
            documentId:
              pullFilter.documentId === undefined ? [] : pullFilter.documentId,
            documentType:
              pullFilter.documentType === undefined
                ? []
                : pullFilter.documentType,
            scope: pullFilter.scope === undefined ? [] : pullFilter.scope,
          },
        }),
      });
      return { driveId: drive.header.id };
    }),

    getDocumentModels: toolWithCallback(getDocumentModelsTool, () => {
      const documentModels = reactor.getDocumentModelModules();
      return {
        documentModels: documentModels.map((model) => {
          const schema = model.documentModel;
          return {
            name: schema.name,
            type: schema.id,
            description: schema.description,
            extension: schema.extension,
            authorName: schema.author.name,
            authorWebsite: schema.author.website ?? "",
          };
        }),
      };
    }),

    getDocumentModelSchema: toolWithCallback(
      getDocumentModelSchemaTool,
      (params) => {
        const documentModel = getDocumentModelModule(params.type);
        const schema = documentModel?.documentModel;
        if (!schema) {
          throw new Error(`Document model '${params.type}' not found`);
        }
        return { schema };
      },
    ),
  } as const;

  const resources = {};

  const prompts = {};

  return {
    tools,
    resources,
    prompts,
  } as const;
}
