import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ResolveZodSchema, ToolSchema } from "./types.js";

export class InvalidToolOutputError extends Error {
  constructor(zodError: z.ZodError) {
    super("Invalid tool output\n" + zodError.message);
    this.name = "InvalidToolOutputError";
    this.cause = zodError;
  }
}

/**
 * Creates a tool with a callback function that handles the tool execution,
 * ensuring the output is valid and errors are handled and returned correctly.
 * @param tool The tool schema to wrap.
 * @param toolCallback The callback function to execute when the tool is called.
 * @returns A CallToolResult with structuredContent if OutputSchema is defined or content if undefined. If the
 * callback throws an error, the result will have isError set to true and the error message in the content.
 */
export function toolWithCallback<T extends ToolSchema>(
  tool: T,
  toolCallback: (
    args: ResolveZodSchema<T["inputSchema"]>,
  ) =>
    | ResolveZodSchema<T["outputSchema"]>
    | Promise<ResolveZodSchema<T["outputSchema"]>>,
) {
  const outputSchema = tool.outputSchema
    ? z.object(tool.outputSchema)
    : undefined;
  const wrappedCallback = async (args: ResolveZodSchema<T["inputSchema"]>) => {
    try {
      const result = await toolCallback(args);

      const validResult = outputSchema?.safeParse(result);
      if (validResult && !validResult.success) {
        throw new InvalidToolOutputError(validResult.error);
      }
      return {
        content: outputSchema
          ? []
          : [
              {
                type: "text",
                text: JSON.stringify(result),
                mimeType: "application/json",
              },
            ],
        structuredContent: outputSchema ? result : undefined,
      } as const satisfies CallToolResult;
    } catch (error) {
      const errorString =
        error instanceof Error ? error.message : String(error);
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `Error: ${errorString}`,
          },
        ],
        structuredContent: {
          error: errorString,
        },
      } as const satisfies CallToolResult;
    }
  };
  return {
    ...tool,
    callback: wrappedCallback,
  };
}
