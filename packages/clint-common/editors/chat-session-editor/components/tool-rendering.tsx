import type { ContentPart } from "document-models/chat-session";
import {
  createContext,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";

// ── Custom tool rendering ──────────────────────────────────────────────────────
//
// Apps that embed the chat session editor can override how individual agent
// tools are rendered. A consumer passes `toolRenderers` to <ChatSession>; for
// every TOOL_CALL / TOOL_RESULT content part we resolve a renderer by tool name
// and fall back to the built-in UI when none matches.

/** Lifecycle state of a tool invocation, mapped to the built-in status badge. */
export type ToolRenderState =
  | "input-available"
  | "output-available"
  | "output-error";

/**
 * Props passed to a custom tool renderer. Arguments and results are already
 * parsed (JSON when possible, otherwise the raw string), so renderers don't
 * have to touch the underlying document shape. The raw `callPart`/`resultPart`
 * are exposed as an escape hatch, and `Default` renders the built-in tool UI so
 * a custom renderer can compose with or partially override it.
 */
export type ToolRenderProps = {
  /** Tool name (never empty — falls back to `'unknown'`). */
  toolName: string;
  /** Parsed tool-call arguments. `undefined` for standalone tool results. */
  args: unknown;
  /** Parsed tool result. `undefined` while the call is still pending. */
  result: unknown;
  /** Whether the result represents an error. */
  isError: boolean;
  /** Whether a result is available yet. */
  hasResult: boolean;
  /** Lifecycle state, for status indicators. */
  state: ToolRenderState;
  /** Raw TOOL_CALL content part. Absent for standalone tool results. */
  callPart?: ContentPart;
  /** Raw TOOL_RESULT content part. Absent while the call is pending. */
  resultPart?: ContentPart;
  /** The built-in tool renderer — render it to reuse the default UI. */
  Default: ComponentType<ToolRenderProps>;
};

/** A component that renders a single agent tool invocation. */
export type ToolRenderer = ComponentType<ToolRenderProps>;

/**
 * Registry of custom tool renderers. Either a map keyed by exact tool name, or
 * a resolver function for wildcard / prefix matching (e.g. MCP tools). Returning
 * `undefined` from the resolver falls back to the built-in renderer.
 */
export type ToolRenderers =
  | Record<string, ToolRenderer>
  | ((toolName: string) => ToolRenderer | undefined);

/** Resolve a renderer for `toolName` from a registry, if any. */
export function resolveToolRenderer(
  renderers: ToolRenderers | undefined,
  toolName: string,
): ToolRenderer | undefined {
  if (!renderers) return undefined;
  if (typeof renderers === "function") return renderers(toolName);
  return renderers[toolName];
}

const ToolRenderersContext = createContext<ToolRenderers | undefined>(
  undefined,
);

export function ToolRenderersProvider({
  renderers,
  children,
}: {
  renderers: ToolRenderers | undefined;
  children: ReactNode;
}) {
  return (
    <ToolRenderersContext.Provider value={renderers}>
      {children}
    </ToolRenderersContext.Provider>
  );
}

/** Resolve the custom renderer for `toolName` from context, if one is registered. */
export function useToolRenderer(toolName: string): ToolRenderer | undefined {
  const renderers = useContext(ToolRenderersContext);
  return resolveToolRenderer(renderers, toolName);
}
