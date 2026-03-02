import type { ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type {
  Prompt,
  Resource,
  ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import type { z, ZodRawShape } from "zod";

export type ExtractCallbackFromTool<T extends ToolSchema> = T extends {
  inputSchema: infer S;
}
  ? ToolCallback<S extends ZodRawShape ? S : undefined>
  : ToolCallback;

export type ToolWithCallback<T extends ToolSchema = ToolSchema> = T & {
  callback: ExtractCallbackFromTool<T>;
};

export type ToolSchema<
  InputArgs extends ZodRawShape = ZodRawShape,
  OutputArgs extends ZodRawShape = ZodRawShape,
> = {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: InputArgs;
  outputSchema?: OutputArgs;
  annotations?: ToolAnnotations;
};

export type ResolveZodSchema<T> = T extends z.ZodRawShape
  ? z.infer<z.ZodObject<T>>
  : T;

export interface IMcpProvider<
  T extends ToolWithCallback = ToolWithCallback,
  R extends Resource = Resource,
  P extends Prompt = Prompt,
> {
  tools: Record<T["name"], ToolWithCallback<T>>;
  resources: Record<R["name"], R>;
  prompts: Record<P["name"], P>;
}
