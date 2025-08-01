import {
  McpServer,
  ResourceTemplate,
} from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  generateFromDocument,
  validateDocumentModelState,
} from "@powerhousedao/codegen";
import { getConfig } from "@powerhousedao/config/utils";
import * as documentModelZ from "document-model/document-model/gen/schema/zod";
import { z } from "zod";
import { type IReactorMcp, type IDocumentModelMcp } from "./reactor.js";

// Discriminated union schema that ties each action type to its specific input schema
const DocumentModelActionSchema = z.discriminatedUnion("type", [
  // Versioning and Change Log Operations
  z.object({
    type: z
      .literal("ADD_CHANGE_LOG_ITEM")
      .describe("Add a new item to the version change log"),
    input: documentModelZ.AddChangeLogItemInputSchema(),
  }),
  z.object({
    type: z
      .literal("DELETE_CHANGE_LOG_ITEM")
      .describe("Remove an item from the version change log"),
    input: documentModelZ.DeleteChangeLogItemInputSchema(),
  }),
  z.object({
    type: z
      .literal("UPDATE_CHANGE_LOG_ITEM")
      .describe("Update an existing change log item"),
    input: documentModelZ.UpdateChangeLogItemInputSchema(),
  }),
  z.object({
    type: z
      .literal("REORDER_CHANGE_LOG_ITEMS")
      .describe("Reorder items in the change log"),
    input: documentModelZ.ReorderChangeLogItemsInputSchema(),
  }),
  z.object({
    type: z
      .literal("RELEASE_NEW_VERSION")
      .describe("Release a new version of the document model"),
    input: z.object({}), // No input required for version release
  }),

  // Model Header Operations
  z.object({
    type: z
      .literal("SET_MODEL_NAME")
      .describe("Set the name of the document model"),
    input: documentModelZ.SetModelNameInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_MODEL_ID")
      .describe("Set the unique identifier for the document model"),
    input: documentModelZ.SetModelIdInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_MODEL_DESCRIPTION")
      .describe("Set the description of the document model"),
    input: documentModelZ.SetModelDescriptionInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_MODEL_EXTENSION")
      .describe("Set the file extension for document model files"),
    input: documentModelZ.SetModelExtensionInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_AUTHOR_NAME")
      .describe("Set the author name for the document model"),
    input: documentModelZ.SetAuthorNameInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_AUTHOR_WEBSITE")
      .describe("Set the author website for the document model"),
    input: documentModelZ.SetAuthorWebsiteInputSchema(),
  }),

  // Module Operations
  z.object({
    type: z
      .literal("ADD_MODULE")
      .describe("Add a new module to the document model"),
    input: documentModelZ.AddModuleInputSchema(),
  }),
  z.object({
    type: z
      .literal("DELETE_MODULE")
      .describe("Remove a module from the document model"),
    input: documentModelZ.DeleteModuleInputSchema(),
  }),
  z.object({
    type: z
      .literal("REORDER_MODULES")
      .describe("Reorder modules in the document model"),
    input: documentModelZ.ReorderModulesInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_MODULE_NAME")
      .describe("Set the name of a specific module"),
    input: documentModelZ.SetModuleNameInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_MODULE_DESCRIPTION")
      .describe("Set the description of a specific module"),
    input: documentModelZ.SetModuleDescriptionInputSchema(),
  }),

  // Operation Operations
  z.object({
    type: z
      .literal("ADD_OPERATION")
      .describe("Add a new operation to a module"),
    input: documentModelZ.AddOperationInputSchema(),
  }),
  z.object({
    type: z
      .literal("DELETE_OPERATION")
      .describe("Remove an operation from a module"),
    input: documentModelZ.DeleteOperationInputSchema(),
  }),
  z.object({
    type: z
      .literal("MOVE_OPERATION")
      .describe("Move an operation between modules"),
    input: documentModelZ.MoveOperationInputSchema(),
  }),
  z.object({
    type: z
      .literal("REORDER_MODULE_OPERATIONS")
      .describe("Reorder operations within a module"),
    input: documentModelZ.ReorderModuleOperationsInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_NAME")
      .describe("Set the name of an operation"),
    input: documentModelZ.SetOperationNameInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_DESCRIPTION")
      .describe("Set the description of an operation"),
    input: documentModelZ.SetOperationDescriptionInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_SCHEMA")
      .describe("Set the input schema for an operation"),
    input: documentModelZ.SetOperationSchemaInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_SCOPE")
      .describe("Set the scope (global/local) of an operation"),
    input: documentModelZ.SetOperationScopeInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_TEMPLATE")
      .describe("Set the template for an operation"),
    input: documentModelZ.SetOperationTemplateInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_REDUCER")
      .describe("Set the reducer function for an operation"),
    input: documentModelZ.SetOperationReducerInputSchema(),
  }),

  // Operation Error Operations
  z.object({
    type: z
      .literal("ADD_OPERATION_ERROR")
      .describe("Add an error definition to an operation"),
    input: documentModelZ.AddOperationErrorInputSchema(),
  }),
  z.object({
    type: z
      .literal("DELETE_OPERATION_ERROR")
      .describe("Remove an error definition from an operation"),
    input: documentModelZ.DeleteOperationErrorInputSchema(),
  }),
  z.object({
    type: z
      .literal("REORDER_OPERATION_ERRORS")
      .describe("Reorder error definitions for an operation"),
    input: documentModelZ.ReorderOperationErrorsInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_ERROR_CODE")
      .describe("Set the error code for an operation error"),
    input: documentModelZ.SetOperationErrorCodeInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_OPERATION_ERROR_NAME")
      .describe("Set the name for an operation error"),
    input: documentModelZ.SetOperationErrorNameInputSchema(),
  }),

  // Operation Example Operations
  z.object({
    type: z
      .literal("ADD_OPERATION_EXAMPLE")
      .describe("Add an example to an operation"),
    input: documentModelZ.AddOperationExampleInputSchema(),
  }),
  z.object({
    type: z
      .literal("DELETE_OPERATION_EXAMPLE")
      .describe("Remove an example from an operation"),
    input: documentModelZ.DeleteOperationExampleInputSchema(),
  }),
  z.object({
    type: z
      .literal("UPDATE_OPERATION_EXAMPLE")
      .describe("Update an existing operation example"),
    input: documentModelZ.UpdateOperationExampleInputSchema(),
  }),
  z.object({
    type: z
      .literal("REORDER_OPERATION_EXAMPLES")
      .describe("Reorder examples for an operation"),
    input: documentModelZ.ReorderOperationExamplesInputSchema(),
  }),

  // State Operations
  z.object({
    type: z
      .literal("SET_STATE_SCHEMA")
      .describe("Set the state schema for global or local state"),
    input: documentModelZ.SetStateSchemaInputSchema(),
  }),
  z.object({
    type: z
      .literal("SET_INITIAL_STATE")
      .describe("Set the initial state value for global or local state"),
    input: documentModelZ.SetInitialStateInputSchema(),
  }),
  z.object({
    type: z
      .literal("ADD_STATE_EXAMPLE")
      .describe("Add an example to state schema"),
    input: documentModelZ.AddStateExampleInputSchema(),
  }),
  z.object({
    type: z
      .literal("DELETE_STATE_EXAMPLE")
      .describe("Remove an example from state schema"),
    input: documentModelZ.DeleteStateExampleInputSchema(),
  }),
  z.object({
    type: z
      .literal("UPDATE_STATE_EXAMPLE")
      .describe("Update an existing state example"),
    input: documentModelZ.UpdateStateExampleInputSchema(),
  }),
  z.object({
    type: z
      .literal("REORDER_STATE_EXAMPLES")
      .describe("Reorder examples for state schema"),
    input: documentModelZ.ReorderStateExamplesInputSchema(),
  }),
]);

export function createServer(reactor: IReactorMcp & IDocumentModelMcp) {
  // Create an MCP server for document model operations.
  // For document model creation tasks, consider using the document-model-creator agent
  // which provides a more guided experience.
  const server = new McpServer(
    {
      name: "reactor-mcp-server",
      version: "1.0.0",
    },
    {
      capabilities: {
        tools: {},
        resources: {
          subscribe: true,
          listChanged: true,
        },
        prompts: {
          listChanged: true,
        },
      },
    },
  );

  server.registerTool(
    "createDocumentModel",
    {
      title: "Create Document Model",
      description:
        "Create a new document model. For document model creation tasks, consider using the document-model-creator agent which provides a more guided experience.",
      inputSchema: {
        name: z.string(),
      },
    },
    async ({ name }) => {
      try {
        await reactor.createDocumentModel(name);
        return {
          content: [],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${errorString}` }],
        };
      }
    },
  );

  server.registerTool(
    "addDocumentModelAction",
    {
      title: "Add Document Model Action",
      description:
        "Add an action to a document model. For document model design and modification tasks, consider using the document-model-creator agent which provides a more guided experience.",
      inputSchema: {
        documentModelName: z
          .string()
          .describe("Name of the document model to modify"),
        action: DocumentModelActionSchema.describe(
          "Action with its specific input data to perform on the document model",
        ),
      },
    },
    async ({ documentModelName, action }) => {
      try {
        const result = await reactor.addDocumentModelAction(documentModelName, {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          type: action.type as any,
          scope: "global",
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          input: action.input as any,
        });
        const errors = result.operations.reduce((errors, op) => {
          if (op.error) {
            errors.push(op.error);
          }
          return errors;
        }, [] as string[]);

        const causeString =
          result.error?.cause instanceof Error
            ? ` (${result.error.cause.message})`
            : result.error?.cause
              ? // eslint-disable-next-line @typescript-eslint/no-base-to-string
                String(result.error.cause)
              : errors.length > 0
                ? errors.join("\n- ")
                : undefined;
        const errorString = result.error
          ? `Error: ${result.error.message}${causeString ? ` (${causeString})` : ""}`
          : undefined;
        return {
          isError: result.status !== "SUCCESS",
          content: [
            {
              type: "text",
              text: `Status: ${result.status}${errorString ? "\n" + errorString : ""}`,
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${errorString}` }],
        };
      }
    },
  );

  // server.registerTool(
  //   "getDocument",
  //   {
  //     title: "Get Document",
  //     description: "Get a document by id",
  //     inputSchema: { id: z.string() },
  //     outputSchema: documentModelZ.DocumentModelStateSchema().shape,
  //   },
  //   async ({ id }) => {
  //     try {
  //       const documentModel = await reactor.getDocumentModel(name);
  //       return {
  //         content: [],
  //         structuredContent: documentModel,
  //       };
  //     } catch (error) {
  //       const errorString =
  //         error instanceof Error ? error.message : String(error);
  //       return {
  //         isError: true,
  //         content: [{ type: "text", text: `Error: ${errorString}` }],
  //       };
  //     }
  //   },
  // );

  // server.registerTool(
  //   "getDocumentModels",
  //   {
  //     title: "Get Document Models",
  //     description: "Get all document models",
  //     inputSchema: {},
  //     outputSchema: {
  //       documentModels: z.record(
  //         z.string(),
  //         documentModelZ.DocumentModelStateSchema(),
  //       ),
  //     },
  //   },
  //   async () => {
  //     try {
  //       const documentModels = await reactor.getDocumentModels();
  //       return {
  //         content: [],
  //         structuredContent: {
  //           documentModels,
  //         },
  //       };
  //     } catch (error) {
  //       const errorString =
  //         error instanceof Error ? error.message : String(error);
  //       return {
  //         isError: true,
  //         content: [{ type: "text", text: `Error: ${errorString}` }],
  //       };
  //     }
  //   },
  // );

  server.registerTool(
    "generateDocumentModel",
    {
      title: "Generate Document Model",
      description:
        "Generate a document model. For document model creation and generation tasks, consider using the document-model-creator agent which provides a more guided experience.",
      inputSchema: {
        name: z.string(),
      },
    },
    async ({ name }) => {
      try {
        const config = getConfig();
        const documentModel = await reactor.getDocumentModel(name);
        const validationResult = validateDocumentModelState(documentModel);
        if (!validationResult.isValid) {
          return {
            isError: true,
            content: validationResult.errors.map((error) => ({
              type: "text",
              text: `Error: ${error}`,
            })),
          };
        }
        try {
          await generateFromDocument(documentModel, config);
        } catch (error) {
          const errorString =
            error instanceof Error ? error.message : String(error);
          return {
            isError: true,
            content: [{ type: "text", text: `Error: ${errorString}` }],
          };
        }

        return {
          content: [],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${errorString}` }],
        };
      }
    },
  );

  // Register resources for document model schemas and metadata
  server.registerResource(
    "document-model-schema",
    new ResourceTemplate("document-model://schema/{name}", {
      list: async () => {
        try {
          const documentModels = await reactor.getDocumentModels();
          return {
            resources: Object.keys(documentModels).map((name) => ({
              uri: `document-model://schema/${name}`,
              name: `${name} Schema`,
              description:
                documentModels[name].description ||
                `Schema for the ${name} document model`,
              mimeType: "application/json",
            })),
          };
        } catch (error) {
          // Return empty list on error to avoid breaking the listing
          return { resources: [] };
        }
      },
    }),
    {
      title: "Document Model Schema",
      description: "Get the schema of a specific document model",
      mimeType: "application/json",
    },
    async (uri, { name }) => {
      try {
        const modelName = Array.isArray(name) ? name[0] : name;
        const documentModel = await reactor.getDocumentModel(modelName);
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(documentModel, null, 2),
              mimeType: "application/json",
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              text: `Error retrieving document model schema: ${errorString}`,
              mimeType: "text/plain",
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "document-models-list",
    "document-model://list",
    {
      title: "Document Models List",
      description: "Get a list of all available document models",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const documentModels = await reactor.getDocumentModels();
        const modelList = Object.keys(documentModels).map((name) => ({
          name,
          id: documentModels[name].id,
          description: documentModels[name].description || "No description",
        }));
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(modelList, null, 2),
              mimeType: "application/json",
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              text: `Error retrieving document models list: ${errorString}`,
              mimeType: "text/plain",
            },
          ],
        };
      }
    },
  );

  server.registerTool(
    "createDocument",
    {
      title: "Create Document",
      description:
        "Create a new document of a specific document model type with a given name.",
      inputSchema: {
        documentType: z.string().describe("The document model type to create"),
        name: z.string().describe("The name for the new document"),
      },
    },
    async ({ documentType, name }) => {
      try {
        const result = await reactor.createDocument(documentType, name);
        return {
          content: [
            {
              type: "text",
              text: `Document created successfully with ID: ${result.id}`,
            },
          ],
          structuredContent: {
            id: result.id,
            name: result.document.header.name,
            documentType: result.document.header.documentType,
          },
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${errorString}` }],
        };
      }
    },
  );

  server.registerTool(
    "addAction",
    {
      title: "Add Action",
      description:
        "Add an action to any document by ID. Actions are operations that modify document state.",
      inputSchema: {
        documentId: z.string().describe("ID of the document to modify"),
        action: z
          .object({
            type: z.string().describe("The action type"),
            input: z
              .unknown()
              .transform((input) => input || {})
              .describe("The action input"),
            scope: z
              .enum(["global", "local"])
              .describe("The scope of the action"),
          })
          .describe("The action to perform on the document"),
      },
    },
    async ({ documentId, action }) => {
      try {
        const result = await reactor.addAction(documentId, action);
        const errors = result.operations.reduce((errors, op) => {
          if (op.error) {
            errors.push(op.error);
          }
          return errors;
        }, [] as string[]);

        const causeString =
          result.error?.cause instanceof Error
            ? ` (${result.error.cause.message})`
            : result.error?.cause
              ? // eslint-disable-next-line @typescript-eslint/no-base-to-string
                String(result.error.cause)
              : errors.length > 0
                ? errors.join("\n- ")
                : undefined;
        const errorString = result.error
          ? `Error: ${result.error.message}${causeString ? ` (${causeString})` : ""}`
          : undefined;
        return {
          isError: result.status !== "SUCCESS",
          content: [
            {
              type: "text",
              text: `Status: ${result.status}${errorString ? "\n" + errorString : ""}`,
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          isError: true,
          content: [{ type: "text", text: `Error: ${errorString}` }],
        };
      }
    },
  );

  // Register resource for individual documents
  server.registerResource(
    "document",
    new ResourceTemplate("document://{id}", {
      list: async () => {
        try {
          const documentIds = await reactor.getDocuments();
          return {
            resources: documentIds.map((id) => ({
              uri: `document://${id}`,
              name: `Document ${id}`,
              description: `Document with ID ${id}`,
              mimeType: "application/json",
            })),
          };
        } catch (error) {
          // Return empty list on error to avoid breaking the listing
          return { resources: [] };
        }
      },
    }),
    {
      title: "Document",
      description: "Get a specific document by ID",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      try {
        const documentId = Array.isArray(id) ? id[0] : id;
        const document = await reactor.getDocument(documentId);
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(document, null, 2),
              mimeType: "application/json",
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              text: `Error retrieving document: ${errorString}`,
              mimeType: "text/plain",
            },
          ],
        };
      }
    },
  );

  server.registerResource(
    "documents-list",
    "documents://list",
    {
      title: "Documents List",
      description: "Get a list of all available document IDs",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const documentIds = await reactor.getDocuments();
        return {
          contents: [
            {
              uri: uri.href,
              text: JSON.stringify(documentIds, null, 2),
              mimeType: "application/json",
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          contents: [
            {
              uri: uri.href,
              text: `Error retrieving documents list: ${errorString}`,
              mimeType: "text/plain",
            },
          ],
        };
      }
    },
  );

  // Register prompts for document model operations
  server.registerPrompt(
    "analyze-document-model",
    {
      title: "Analyze Document Model",
      description:
        "Analyze a document model structure and suggest improvements",
      argsSchema: {
        modelName: z.string().describe("Name of the document model to analyze"),
      },
    },
    async ({ modelName }) => {
      try {
        const documentModel = await reactor.getDocumentModel(modelName);
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Please analyze this document model structure and suggest improvements for maintainability, performance, and best practices:\n\nModel Name: ${modelName}\n\nStructure:\n${JSON.stringify(
                  documentModel,
                  null,
                  2,
                )}`,
              },
            },
          ],
        };
      } catch (error) {
        const errorString =
          error instanceof Error ? error.message : String(error);
        return {
          messages: [
            {
              role: "user",
              content: {
                type: "text",
                text: `Error analyzing document model "${modelName}": ${errorString}`,
              },
            },
          ],
        };
      }
    },
  );

  server.registerPrompt(
    "create-document-model-template",
    {
      title: "Create Document Model Template",
      description: "Generate a template for creating a new document model",
      argsSchema: {
        purpose: z
          .string()
          .describe("The purpose or use case for the document model"),
        domain: z
          .string()
          .optional()
          .describe(
            "The business domain (e.g., finance, content, project management)",
          ),
      },
    },
    async ({ purpose, domain }) => {
      const domainContext = domain ? ` in the ${domain} domain` : "";
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: `Please help me create a document model template for: ${purpose}${domainContext}

Please provide:
1. A suggested document model structure with state schema
2. Key operations that should be supported
3. Business logic considerations
4. Best practices for this type of document model

Focus on creating a well-structured, maintainable design that follows Powerhouse document model conventions.`,
            },
          },
        ],
      };
    },
  );

  return server;
}
