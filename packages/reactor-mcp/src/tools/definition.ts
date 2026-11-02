import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import type { ReactorToolClient } from "./client.js";
import { ReactorToolError, toReactorToolError } from "./errors.js";

/** MCP tool annotations; structural, so no MCP SDK import is needed. */
export type ReactorToolAnnotations = {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
};

export type ToolContext<C = ReactorToolClient> = {
  client: C;
  signal?: AbortSignal;
};

// A transport-neutral tool: `execute` returns data matching `outputSchema`
// or throws a ReactorToolError.
export type ToolDefinition<
  I extends z.ZodObject = z.ZodObject,
  O extends z.ZodObject = z.ZodObject,
  C = ReactorToolClient,
  N extends string = string,
> = {
  name: N;
  title: string;
  description: string;
  inputSchema: I;
  outputSchema: O;
  annotations: ReactorToolAnnotations;
  execute: (args: z.infer<I>, ctx: ToolContext<C>) => Promise<z.infer<O>>;
};

// Erases the schema parameters so heterogeneous definitions share one list.
export type AnyToolDefinition<C = ReactorToolClient> = {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodObject;
  outputSchema: z.ZodObject;
  annotations: ReactorToolAnnotations;
  execute: (args: never, ctx: ToolContext<C>) => Promise<unknown>;
};

export function defineTool<
  I extends z.ZodObject,
  O extends z.ZodObject,
  N extends string,
  C = ReactorToolClient,
>(definition: ToolDefinition<I, O, C, N>): ToolDefinition<I, O, C, N> {
  return definition;
}

/** Whether running the tool can change state; unannotated tools count as writes. */
export function isWriteTool(annotations?: ReactorToolAnnotations): boolean {
  return annotations?.readOnlyHint !== true;
}

/** Text of an error as the MCP and `ai` adapters report it. */
export function formatToolError(error: ReactorToolError): string {
  return `${error.code}: ${error.message}`;
}

export type McpToolRecord<D extends AnyToolDefinition<never>> = {
  name: D["name"];
  title: string;
  description: string;
  inputSchema: D["inputSchema"]["shape"];
  outputSchema: D["outputSchema"]["shape"];
  annotations: ReactorToolAnnotations;
  callback: (
    args: z.infer<D["inputSchema"]>,
    extra?: { signal?: AbortSignal },
  ) => Promise<CallToolResult>;
};

type Execute<C> = (args: unknown, ctx: ToolContext<C>) => Promise<unknown>;

/** Wraps a definition for `McpServer.registerTool`; errors become `isError` results. */
export function toMcpTool<D extends AnyToolDefinition<C>, C>(
  definition: D,
  ctx: ToolContext<C>,
): McpToolRecord<D> {
  const execute = definition.execute as Execute<C>;
  return {
    name: definition.name,
    title: definition.title,
    description: definition.description,
    inputSchema: definition.inputSchema.shape,
    outputSchema: definition.outputSchema.shape,
    annotations: { title: definition.title, ...definition.annotations },
    callback: async (args, extra) => {
      try {
        const result = (await execute(args, {
          ...ctx,
          signal: extra?.signal ?? ctx.signal,
        })) as Record<string, unknown>;
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result,
        };
      } catch (error) {
        const toolError = toReactorToolError(error);
        return {
          isError: true,
          content: [
            { type: "text", text: `Error: ${formatToolError(toolError)}` },
          ],
          _meta: { error: toolError.toJSON() },
        };
      }
    },
  };
}

/** Structurally an `ai` SDK `Tool`; zod schemas are accepted as-is. */
export type AiSdkTool<D extends AnyToolDefinition<never>> = {
  title: string;
  description: string;
  inputSchema: D["inputSchema"];
  outputSchema: D["outputSchema"];
  execute: (
    args: z.infer<D["inputSchema"]>,
    options?: { abortSignal?: AbortSignal },
  ) => Promise<z.infer<D["outputSchema"]>>;
};

export type AiSdkToolSet<D extends AnyToolDefinition<never>> = {
  [K in D["name"]]: AiSdkTool<Extract<D, { name: K }>>;
};

/** Builds an `ai` SDK ToolSet without importing `ai`; failures throw with the code in the message. */
export function toAiSdkTools<D extends AnyToolDefinition<C>, C>(
  definitions: readonly D[],
  ctx: ToolContext<C>,
): AiSdkToolSet<D> {
  const tools: Record<string, AiSdkTool<D>> = {};
  for (const definition of definitions) {
    const execute = definition.execute as Execute<C>;
    tools[definition.name] = {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      outputSchema: definition.outputSchema,
      execute: async (args, options) => {
        try {
          return (await execute(args, {
            ...ctx,
            signal: options?.abortSignal ?? ctx.signal,
          })) as z.infer<D["outputSchema"]>;
        } catch (error) {
          const toolError = toReactorToolError(error);
          throw new ReactorToolError(
            toolError.code,
            formatToolError(toolError),
            { failures: toolError.failures, cause: error },
          );
        }
      },
    };
  }
  return tools as AiSdkToolSet<D>;
}
