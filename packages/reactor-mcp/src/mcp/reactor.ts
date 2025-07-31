import type { IDocumentDriveServer } from "document-drive";
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

type ToolRecord<T extends readonly ToolSchema[]> = {
  [K in T[number]["name"]]: ToolWithCallback<Extract<T[number], { name: K }>>;
};

// All tools array for type inference
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const allTools = [getDocumentTool] as const;

// Inferred interface from tools
export type ReactorMcpTools = ToolRecord<typeof allTools>;

export async function createReactorMcpProvider(reactor: IDocumentDriveServer) {
  await reactor.initialize();

  const tools: ReactorMcpTools = {
    getDocument: toolWithCallback(getDocumentTool, async (params) => {
      const doc = await reactor.getDocument(params.id);
      return { document: doc };
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
