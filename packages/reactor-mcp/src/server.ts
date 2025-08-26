import { createReactorMcpProvider } from "#tools/reactor.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type IDocumentDriveServer } from "document-drive";

export const ReactorMcpInstructions = `MUST BE USED when handling documents or document-models for the Powerhouse/Vetra ecosystem.
There are 5 main concepts to know of: 
- Document Model: A template for creating documents. It defines the schema and allowed operations for a type of document.
- Document: An instance of a document model. It contains actual data following the structure defined by the document model and can be changed using operations.
- Drive: A document of type "powerhouse/document-drive" which represents a collection of documents and folders. To add documents to a drive, use the "addActions" tool with an "ADD_FILE" action.
- Action: A proposed change to a document. It is a JSON object with the action name and input that defines the action to be taken on the document. Should be dispatched by calling the "addActions" tool.
- Operation: A change done to a document. It contains the action object plus additional metadata such as the index of the operation in the document history, the timestamp it was added, the hash of the resulting document data, the number of operations skipped, and the error message if the operation failed. Actions dispatched with "addActions" get converted into an operation.

When planning to add multiple actions to a document, try to reduce the number of "addActions" calls to a minimum by adding multiple actions at once.
Unless the user specifies otherwise, and a drive with slug "vetra" is available, add newly created documents to it.

Examples:
<example>Context: User needs to create a new document model for their application. user: 'I need to create a user profile document model with fields for name, email, and preferences' assistant: 'I'll use the reactor-mcp-server to help you create this document model.' <commentary>Since the user is requesting document model creation, use the reactor-mcp-document-expert agent to ensure proper reactor-mcp tool usage.</commentary></example> <example>Context: User is building a content management system and needs create documents for certain types of document models. user: 'Can you help me create example documents for blog posts and categories document models?' assistant: 'Let me use the reactor-mcp-server to create these documents using the appropriate reactor-mcp tool calls.' <commentary>Document model creation requires the reactor-mcp-server tool calls to ensure compliance.</commentary></example>
<example>Context: User needs to create a new document instance of a given document model. user: 'I need to create a demo user profile document' assistant: 'I'll use the reactor-mcp-server to help you create this document with example values.' <commentary>Since the user is requesting document model creation, use the reactor-mcp-document-expert agent to ensure proper reactor-mcp tool usage.</commentary></example> <example>Context: User is building a content management system and needs create documents for certain types of document models. user: 'Can you help me create example documents for blog posts and categories document models?' assistant: 'Let me use the reactor-mcp-server to create these documents using the appropriate reactor-mcp tool calls.' <commentary>Document creation requires the reactor-mcp-server tool calls to ensure compliance.</commentary></example>
`;

export async function createServer(
  reactor: IDocumentDriveServer,
): Promise<McpServer> {
  const server = new McpServer(
    {
      name: "reactor-mcp-server",
      version: "1.0.0",
      description: ReactorMcpInstructions,
      instructions: ReactorMcpInstructions,
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

  server.registerResource(
    "instructions",
    "reactor://instructions",
    {
      title: "Instructions",
      description: "General instructions on how to use the tools of this MCP",
      mimeType: "text/plain",
    },
    (uri) => ({
      contents: [
        {
          uri: uri.href,
          text: ReactorMcpInstructions,
        },
      ],
    }),
  );

  const reactorProvider = await createReactorMcpProvider(reactor);

  const { callback, ...toolSchema } = reactorProvider.tools.getDocumentModels;
  // server.registerTool("getDocumentModels", toolSchema, callback);
  Object.entries(reactorProvider.tools).forEach(
    ([toolName, { callback, ...schema }]) => {
      server.registerTool(toolName, schema as any, callback as any);
    },
  );

  return server;
}
