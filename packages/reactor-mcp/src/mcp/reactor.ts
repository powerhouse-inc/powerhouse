import type { IDocumentDriveServer } from "document-drive";
import { generateId } from "document-model";
import { z } from "zod";
import type { ToolSchema, ToolWithCallback } from "./types.js";
import { toolWithCallback } from "./utils.js";

export const getDocumentTool = {
  name: "getDocument",
  description: "Retrieve a document by its ID",
  inputSchema: {
    id: z.string().describe("ID of the document to retrieve"),
  },
  outputSchema: {
    document: z.object({}).describe("Document object"), // TODO: Define document schema
  },
} as const satisfies ToolSchema;

export const createDocumentTool = {
  name: "createDocument",
  description: "Create a new document",
  inputSchema: {
    documentType: z.string().describe("Type of the document to create"),
    documentId: z.string().optional().describe("Optional ID for the document"),
  },
  outputSchema: {
    result: z
      .object({
        status: z
          .enum(["SUCCESS", "CONFLICT", "MISSING", "ERROR"])
          .describe("Operation status"),
        error: z
          .string()
          .optional()
          .describe("Error details if operation failed"), // TODO: Define error schema
        operations: z
          .array(z.object({}))
          .describe("Array of operations created"), // TODO: Define operation schema
        document: z.object({}).optional().describe("Updated document"), // TODO: Define document schema
        signals: z.array(z.object({})).describe("Array of signals generated"), // TODO: Define signal schema
      })
      .describe("Operation result"),
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

export const addActionTool = {
  name: "addAction",
  description: "Add an action to a document",
  inputSchema: {
    documentId: z.string().describe("ID of the document"),
    action: z
      .object({
        type: z.string().describe("The name of the action"),
        input: z.unknown().describe("The payload of the action"),
        scope: z.string().describe("The scope of the action"),
        context: z.object({}).optional().describe("Optional action context"), // TODO: Define context schema
      })
      .strict()
      .describe("Action to add to the document"),
  },
  outputSchema: {
    result: z
      .object({
        status: z
          .enum(["SUCCESS", "CONFLICT", "MISSING", "ERROR"])
          .describe("Operation status"),
        error: z
          .string()
          .optional()
          .describe("Error details if operation failed"), // TODO: Define error schema
        operations: z
          .array(z.object({}))
          .describe("Array of operations created"), // TODO: Define operation schema
        document: z.object({}).optional().describe("Updated document"), // TODO: Define document schema
        signals: z.array(z.object({})).describe("Array of signals generated"), // TODO: Define signal schema
      })
      .describe("Operation result"),
  },
} as const satisfies ToolSchema;

export const addOperationTool = {
  name: "addOperation",
  description: "Add an operation to a document",
  inputSchema: {
    documentId: z.string().describe("ID of the document"),
    operation: z
      .object({
        type: z.string().describe("The name of the action"),
        input: z.unknown().describe("The payload of the action"),
        scope: z.string().describe("The scope of the action"),
        index: z.number().describe("Position of the operation in the history"),
        timestamp: z
          .string()
          .describe("Timestamp of when the operation was added"),
        hash: z.string().describe("Hash of the resulting document data"),
        skip: z.number().describe("The number of operations skipped"),
        error: z
          .string()
          .optional()
          .describe("Error message for a failed action"),
        id: z.string().optional().describe("Unique operation id"),
        context: z.object({}).optional().describe("Optional action context"), // TODO: Define context schema
      })
      .strict()
      .describe("Operation to add to the document"),
  },
  outputSchema: {
    result: z
      .object({
        status: z
          .enum(["SUCCESS", "CONFLICT", "MISSING", "ERROR"])
          .describe("Operation status"),
        error: z
          .string()
          .optional()
          .describe("Error details if operation failed"), // TODO: Define error schema
        operations: z
          .array(z.object({}))
          .describe("Array of operations created"), // TODO: Define operation schema
        document: z.object({}).optional().describe("Updated document"), // TODO: Define document schema
        signals: z.array(z.object({})).describe("Array of signals generated"), // TODO: Define signal schema
      })
      .describe("Operation result"),
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
    drive: z.object({}).describe("Created drive document"), // TODO: Define DocumentDriveDocument schema
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
    drive: z.object({}).describe("Connected remote drive document"), // TODO: Define DocumentDriveDocument schema
  },
} as const satisfies ToolSchema;

type ToolRecord<T extends readonly ToolSchema[]> = {
  [K in T[number]["name"]]: ToolWithCallback<Extract<T[number], { name: K }>>;
};

// All tools array for type inference
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allTools = [
  getDocumentTool,
  createDocumentTool,
  getDocumentsTool,
  deleteDocumentTool,
  addActionTool,
  addOperationTool,
  getDrivesTool,
  addDriveTool,
  getDriveTool,
  deleteDriveTool,
  addRemoteDriveTool,
] as const;

// Inferred interface from tools
export type ReactorMcpTools = ToolRecord<typeof allTools>;

export async function createReactorMcpProvider(reactor: IDocumentDriveServer) {
  await reactor.initialize();

  const tools: ReactorMcpTools = {
    getDocument: toolWithCallback(getDocumentTool, async (params) => {
      const doc = await reactor.getDocument(params.id);
      return { document: doc };
    }),

    createDocument: toolWithCallback(createDocumentTool, async (params) => {
      // Create document input based on provided parameters
      const createInput = {
        documentType: params.documentType,
        id: params.documentId ?? generateId(),
      };

      const result = await reactor.queueDocument(createInput);
      return {
        result: {
          ...result,
          error: result.error?.message,
        },
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

    addAction: toolWithCallback(addActionTool, async (params) => {
      const result = await reactor.addAction(params.documentId, {
        ...params.action,
        input: params.action.input ?? {},
      });
      return {
        result: {
          ...result,
          error: result.error?.message,
        },
      };
    }),

    addOperation: toolWithCallback(addOperationTool, async (params) => {
      const result = await reactor.addOperation(params.documentId, {
        ...params.operation,
        input: params.operation.input ?? {},
      });
      return {
        result: {
          ...result,
          error:
            typeof result.error === "string"
              ? result.error
              : result.error?.message,
        },
      };
    }),

    // Drive operation implementations
    getDrives: toolWithCallback(getDrivesTool, async () => {
      const driveIds = await reactor.getDrives();
      return { driveIds };
    }),

    addDrive: toolWithCallback(addDriveTool, async (params) => {
      // Extract preferredEditor and create proper DriveInput
      const { preferredEditor, ...driveInput } = params.driveInput;
      const drive = await reactor.addDrive(driveInput, preferredEditor);
      return { drive };
    }),

    getDrive: toolWithCallback(getDriveTool, async (params) => {
      const drive = await reactor.getDrive(params.driveId, params.options);
      return { drive };
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
      return { drive };
    }),
  };

  const resources = {};

  const prompts = {};

  return {
    tools,
    resources,
    prompts,
  };
}
