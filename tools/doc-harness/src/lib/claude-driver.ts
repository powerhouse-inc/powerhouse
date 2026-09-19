/**
 * The seam between the workflow and the `claude` CLI. The real driver spawns
 * `claude -p`; the fake one used by --dry-run and the tests copies fixtures.
 */
import type { AuthMode, ClaudeOutcome } from "./schemas.js";

export interface ClaudeInvocation {
  /** Working directory; also what Claude Code treats as the project. */
  cwd: string;
  prompt: string;
  systemPromptFile: string;
  model: string;
  /** Per-invocation settings JSON (permissions allow/deny). */
  settingsFile: string;
  addDirs: string[];
  /** Built-in tool names passed to --tools; [] disables all tools. */
  tools: string[];
  permissionMode: "dontAsk" | "bypassPermissions";
  maxTurns: number;
  maxBudgetUsd: number;
  /** Outer wall clock; the process group is killed when it elapses. */
  wallClockMs: number;
  /** Path to a JSON Schema file for --json-schema; omit for free text. */
  jsonSchemaFile?: string;
  sessionId: string;
  authMode: AuthMode;
  /** Where stdout (stream-json) is written, line by line. */
  transcriptPath: string;
  stderrPath: string;
  /** Copy the on-disk session file here after the run, if it exists. */
  sessionJsonlCopyPath?: string;
  /** Overrides CLAUDE_CONFIG_DIR for the child. */
  configDir?: string;
  extraEnv?: NodeJS.ProcessEnv;
}

export interface ClaudeDriver {
  readonly name: string;
  /** `claude --version` output, resolved once. */
  version(): Promise<string>;
  run(invocation: ClaudeInvocation): Promise<ClaudeOutcome>;
}

/** The CLI version the transcript extractor's fixtures were recorded with. */
export const VALIDATED_CLI_VERSION = "2.1.258";

/** Canonical ids observed from `--model sonnet|opus|haiku` on 2.1.258. */
export const MODEL_IDS = {
  builder: "claude-sonnet-5",
  judge: "claude-opus-5",
  cheap: "claude-haiku-4-5-20251001",
} as const;
