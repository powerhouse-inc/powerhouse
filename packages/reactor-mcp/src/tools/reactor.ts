import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import { driveCollectionId } from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "document-drive";
import type { Action, DocumentModelModule, PHDocument } from "document-model";
import { generateId } from "document-model";
import { z } from "zod";
import type { ToolSchema, ToolWithCallback } from "./types.js";
import { toolWithCallback, validateDocumentModelAction } from "./utils.js";

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

export type ReactorMcpProviderOptions = {
  client: IReactorClient;
  syncManager?: ISyncManager;
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
  description: "Retrieve a document by its ID",
  inputSchema: {
    id: z.string().describe("ID of the document to retrieve"),
  },
  outputSchema: {
    document: z.unknown().describe("The retrieved Document"),
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
              .record(z.string(), z.unknown())
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

export const getDocumentModelSchemaTool = {
  name: "getDocumentModelSchema",
  description: "Get the schema of a document model",
  inputSchema: {
    type: z.string().describe("Type of the document model"),
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

export async function createReactorMcpProvider(
  options: ReactorMcpProviderOptions,
) {
  const { client, syncManager } = options;
  // No initialization needed - client is already initialized

  async function getDocumentModelModule(documentType: string) {
    return client.getDocumentModelModule(documentType);
  }

  const tools = {
    getDocument: toolWithCallback(getDocumentTool, async (params) => {
      const document = await client.get<PHDocument>(params.id);
      return { document: { header: document.header, state: document.state } };
    }),

    createDocument: toolWithCallback(createDocumentTool, async (params) => {
      if (params.driveId) {
        const module = await getDocumentModelModule(params.documentType);
        if (!module) {
          throw new Error(
            `Document model for type '${params.documentType}' not found`,
          );
        }
        const document = module.utils.createDocument();
        if (params.name) {
          document.header.name = params.name;
        }
        const created = await client.createDocumentInDrive(
          params.driveId,
          document,
          params.parentFolder,
        );
        return { documentId: created.header.id };
      }

      const created = await client.createEmpty(params.documentType, {});
      return { documentId: created.header.id };
    }),

    getDocuments: toolWithCallback(getDocumentsTool, async (params) => {
      // Use getChildren to get documents under a parent (drive)
      const result = await client.getChildren(params.parentId);
      const documentIds = result.results.map((doc) => doc.header.id);
      return { documentIds };
    }),

    deleteDocument: toolWithCallback(deleteDocumentTool, async (params) => {
      try {
        await client.deleteDocument(params.documentId);
        return { success: true };
      } catch {
        return { success: false };
      }
    }),

    addActions: toolWithCallback(addActionsTool, async (params) => {
      const document = await client.get<PHDocument>(params.documentId);
      const documentModel = await getDocumentModelModule(
        document.header.documentType,
      );
      if (!documentModel) {
        throw new Error(
          `Document model for document type '${document.header.documentType}' not found`,
        );
      }
      const actions: Action[] = params.actions.map((paramAction) => {
        const action: Action = {
          id: generateId(),
          timestampUtcMs: new Date().toISOString(),
          type: paramAction.type,
          input: paramAction.input ?? {},
          scope: paramAction.scope,
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

      // Execute actions on the document using the "main" branch
      await client.execute(params.documentId, "main", actions);

      return {
        success: true,
      };
    }),

    // Drive operation implementations
    getDrives: toolWithCallback(getDrivesTool, async () => {
      // Find all documents of type "powerhouse/document-drive"
      const result = await client.find({ type: DRIVE_DOCUMENT_TYPE });
      const driveIds = result.results.map((doc: PHDocument) => doc.header.id);
      return { driveIds };
    }),

    addDrive: toolWithCallback(addDriveTool, async (params) => {
      // Create an empty drive document
      const drive = await client.createEmpty<DocumentDriveDocument>(
        DRIVE_DOCUMENT_TYPE,
        {},
      );

      // If name is provided, set it using an action
      if (params.driveInput.global?.name) {
        await client.rename(drive.header.id, params.driveInput.global.name);
      }

      return { driveId: drive.header.id };
    }),

    getDrive: toolWithCallback(getDriveTool, async (params) => {
      const drive = await client.get<DocumentDriveDocument>(params.driveId);
      return { drive: { header: drive.header, state: drive.state } };
    }),

    deleteDrive: toolWithCallback(deleteDriveTool, async (params) => {
      try {
        // Use CASCADE to delete the drive and all its contents
        await client.deleteDocument(params.driveId);
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
      const collectionId = driveCollectionId("main", resolvedDriveId);

      // Check if remote already exists
      const existingRemote = syncManager
        .list()
        .find((remote) => remote.collectionId === collectionId);
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

    getDocumentModelSchema: toolWithCallback(
      getDocumentModelSchemaTool,
      async (params) => {
        const documentModel = await getDocumentModelModule(params.type);
        const schema = documentModel?.documentModel.global;
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
