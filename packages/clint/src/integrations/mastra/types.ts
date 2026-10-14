import type { AgentProvider } from "../../core/types.js";

/**
 * Options for getTools().
 */
export interface GetToolsOptions {
  /** Include MCP tools from running services with api-mcp endpoints. Default: true */
  includeMcp?: boolean;
  /**
   * MCPClient constructor from `@mastra/mcp`. Required for MCP tool discovery.
   * Must be passed by the consumer because `@mastra/mcp` is resolved from the
   * consumer's node_modules, not from ph-clint's.
   */
  MCPClient?: any;
  /**
   * Glob-style patterns matched against the final tool names (CLI + MCP).
   *
   * Pattern syntax: `*` matches any run of characters, `?` matches one char,
   * `[abc]` matches one char from the set. Patterns are anchored to the full
   * tool name (no implicit wildcards on either side).
   *
   * Semantics:
   *   - `undefined`        → include every tool (default).
   *   - `[]` (empty array) → include none (used for sub-agents with no tool patterns).
   *   - Non-empty array    → include tools whose name matches at least one pattern.
   */
  include?: string[];
}

/**
 * Helpers returned by createMastraHelpers().
 * All Mastra imports happen inside these functions (lazy loading).
 */
/**
 * Options for wrapAgent().
 */
export interface WrapAgentOptions {
  /** Maximum number of tool-call steps per stream() invocation. Default: 30 */
  maxSteps?: number;
  /**
   * Keep the stream open across background-task continuations (Mastra's
   * `stream({ untilIdle })`). The fullStream stays open and emits follow-up
   * turns as the agent's background tasks complete, closing only once none
   * remain. `true` uses the default 5-minute idle timeout; pass
   * `{ maxIdleMs }` to override it.
   *
   * Only takes effect when the agent has memory configured and a `threadId`
   * is passed to stream() (continuations need conversation persistence);
   * otherwise Mastra falls through to a regular stream() call. Default: off.
   */
  untilIdle?: boolean | { maxIdleMs?: number };
  /** Enable conversation logging to disk. Default: false */
  enableLogging?: boolean;
  /** Directory to write log files. Required when enableLogging is true. */
  logDirectory?: string;
  /**
   * Enable Anthropic prompt caching. Passes `providerOptions.anthropic.cacheControl`
   * on every stream() call, enabling automatic cache breakpoint placement.
   *
   * Set to `true` for default 5-minute TTL, or specify `{ ttl: '1h' }` for extended caching.
   * Only effective when the model is Anthropic and the prompt exceeds the model's
   * minimum cacheable token threshold (e.g. 4,096 for Haiku 4.5).
   */
  cacheControl?: boolean | { ttl?: "5m" | "1h" };
  /** Agent description (forwarded to AgentProvider.description). */
  description?: string;
  /** Agent avatar image — data URI or URL (forwarded to AgentProvider.image). */
  image?: string;
}

export interface MastraHelpers {
  /** Convert CLI commands to Mastra createTool() format, optionally including MCP tools from running services. */
  getTools(options?: GetToolsOptions): Promise<Record<string, any>>;
  /** Resolve pre-built agent profile instructions by agent ID. */
  getAgentInstructions(agentId: string): string;
  /** Create a Mastra Workspace rooted at ctx.workdir. */
  createWorkspace(): Promise<any>;
  /**
   * Create Memory with LibSQL at .ph/{cliName}/mastra/mastra.db.
   *
   * `options` is forwarded to Mastra's `new Memory({ options })` — memory
   * behavior config such as `lastMessages`, `workingMemory`, `semanticRecall`,
   * or `observationalMemory` (background compression of long histories).
   */
  createMemory(options?: Record<string, unknown>): Promise<any>;
  /** Wrap a Mastra Agent as an AgentProvider (handles stream mapping). */
  wrapAgent(agent: any, options?: WrapAgentOptions): AgentProvider;
}
