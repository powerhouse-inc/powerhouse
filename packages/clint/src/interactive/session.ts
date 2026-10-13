import { randomUUID } from "node:crypto";
import type { ReplOutput, ReplSession, ReplSessionOptions } from "./types.js";
import type { StreamChunk } from "../core/types.js";
import type { FieldInfo } from "../core/schema.js";
import { parseReplInput } from "./router.js";
import {
  getCompletions,
  getGhostSuggestion,
  getCompletionSuffix,
} from "./completions.js";
import { getSchemaFields } from "../core/schema.js";
import { renderMarkdown } from "./markdown.js";
import { formatStreamChunk } from "../core/stream.js";
import { formatZodError } from "../core/errors.js";
import {
  isSkillInvocation,
  DEFAULT_SKILL_INSTRUCTION,
} from "../core/skill-commands.js";
import type { SkillInvocation } from "../core/skill-commands.js";
import { renderSkillTemplate } from "../core/templates.js";

/**
 * Format a command result for display.
 * If the result has a `.text` string property, use that.
 * Otherwise, convert to string.
 */
function formatResult(result: unknown): string {
  if (result === undefined || result === null) return "";
  if (
    typeof result === "object" &&
    result !== null &&
    "text" in result &&
    typeof (result as Record<string, unknown>).text === "string"
  ) {
    return (result as Record<string, unknown>).text as string;
  }
  return String(result);
}

/**
 * Internal state for multi-step parameter prompting.
 */
interface PromptingState {
  commandId: string;
  collectedArgs: Record<string, unknown>;
  remainingFields: FieldInfo[];
}

/**
 * Determine which fields need interactive prompting for a command.
 *
 * @param explicitKeys - keys explicitly provided by the user (from argv flags)
 *
 * Prompting only triggers when required fields are missing. If all required
 * fields are satisfied, the command executes immediately — even if there are
 * optional fields listed in `promptOptional`.
 *
 * When prompting IS triggered (because required fields are missing):
 * - Missing required fields → prompt
 * - Fields in `promptOptional` not explicitly provided → also prompt
 * - Fields with defaults when `promptForDefaults` is true → also prompt
 *
 * This means `promptOptional` = "if you're already prompting, ask for these too".
 */
function getFieldsToPrompt(
  commandId: string,
  explicitKeys: Set<string>,
  cli: ReplSessionOptions["cli"],
): FieldInfo[] {
  const cmd = cli.getCommand(commandId);
  if (!cmd) return [];

  const fields = getSchemaFields(cmd.inputSchema);
  const prompt = cmd.prompt;

  // First check: are any required fields missing?
  const missingRequired = fields.filter(
    (f) => !explicitKeys.has(f.key) && !f.isOptional && !f.hasDefault,
  );

  // If no required fields are missing, don't prompt at all
  if (missingRequired.length === 0) return [];

  // Required fields are missing — collect all fields to prompt for
  return fields.filter((f) => {
    if (explicitKeys.has(f.key)) return false; // user explicitly provided it
    if (!f.isOptional && !f.hasDefault) return true; // required, must prompt
    if (prompt?.promptForDefaults && f.hasDefault) return true;
    if (prompt?.promptOptional?.includes(f.key)) return true;
    return false;
  });
}

/**
 * Extract which keys the user explicitly provided from raw argv tokens.
 * Counts both --flag tokens and leading positional tokens (mapped to
 * positional field keys in declared order).
 */
function getExplicitKeys(
  argv: string[],
  positional?: readonly string[],
): Set<string> {
  const keys = new Set<string>();
  const positionalKeys = positional ?? [];
  let positionalIdx = 0;
  let sawFlag = false;
  for (const arg of argv) {
    if (arg.startsWith("--")) {
      sawFlag = true;
      keys.add(arg.slice(2));
    } else if (!sawFlag && positionalIdx < positionalKeys.length) {
      keys.add(positionalKeys[positionalIdx]!);
      positionalIdx++;
    }
  }
  return keys;
}

/**
 * Build the prompt text for a field, including type hint and default.
 */
function buildPromptText(field: FieldInfo): string {
  const parts: string[] = [];

  // Show enum values or type hint
  if (field.baseType === "enum") {
    // We can't easily get enum values from FieldInfo alone, but the description helps
    parts.push(field.description ?? field.key);
  } else if (field.baseType === "boolean") {
    parts.push(`${field.description ?? field.key} (true/false)`);
  } else {
    parts.push(field.description ?? field.key);
  }

  if (field.hasDefault) {
    parts.push(`[${field.defaultValue}]`);
  }

  return parts.join(" ");
}

/**
 * Create a REPL session — the testable logic layer for interactive mode.
 *
 * The session processes input lines (e.g. `/greet --name Alice`),
 * dispatches them to commands, and returns formatted output.
 * It is independent of Ink rendering.
 */
export function createReplSession(opts: ReplSessionOptions): ReplSession {
  const { cli, context, agentProvider } = opts;
  const threadId = opts.threadId ?? (agentProvider ? randomUUID() : undefined);
  const commands = cli.listCommands();
  const commandIds = commands.map((c) => c.id);
  const hasDefaultCommand = cli.hasAgent;

  // Prompting state — null when not prompting
  let prompting: PromptingState | null = null;

  // Forward reference — set after session is created, used by handleAgentPrompt
  let sessionRef: ReplSession | null = null;

  // Abort controller for the current agent stream — created per turn
  let currentAbortController: AbortController | null = null;

  /** Render an agent prompt from a SkillInvocation using its template. */
  function renderSkillPromptFromInvocation(
    invocation: SkillInvocation,
  ): string {
    const template =
      invocation.instructionTemplate ?? DEFAULT_SKILL_INSTRUCTION;
    const context: Record<string, unknown> = {
      skillId: invocation.skillName,
      prompt: invocation.userMessage ?? "",
      ...(invocation.inputValues ?? {}),
    };
    const { rendered, warnings } = renderSkillTemplate(template, context);
    for (const w of warnings) {
      console.warn(`[ph-clint] Skill "${invocation.skillName}": ${w}`);
    }
    return rendered.trim();
  }

  function buildExitMessage(): string {
    const parts: string[] = [];

    // Report any services still running
    if (context.services) {
      const dim = "\x1b[2m";
      const reset = "\x1b[0m";
      const active = context.services
        .list()
        .filter((s) => s.status === "ready" || s.status === "starting");
      for (const svc of active) {
        const where = svc.workdir ? ` ${dim}\`${svc.workdir}\`${reset}` : "";
        parts.push(
          `${svc.name} still active${where}\n  ${dim}Run \`${cli.name} ${svc.serviceId}-stop\` to shut it down${reset}\n`,
        );
      }
    }

    if (threadId) {
      parts.push(
        `Goodbye! \x1b[2mTo resume, run: ${cli.name} -i --resume ${threadId}\x1b[0m`,
      );
    } else {
      parts.push("Goodbye!");
    }

    return parts.join("\n");
  }

  // buildExitMessage() is called lazily — services may start after session creation

  /**
   * Execute a command while capturing ctx.stdout() calls.
   * When the command produces progressive output (calls ctx.stdout),
   * emits tool-call / tool-output / tool-result chunks so the REPL
   * renders it in a rolling window. Commands without progressive output
   * stream as text-delta (no segment overhead).
   */
  async function executeCommandWithCapture(
    commandId: string,
    args: Record<string, unknown>,
  ): Promise<ReplOutput> {
    const captured: string[] = [];
    const streamParts: string[] = [];
    let segmentOpened = false;

    const origStdout = context.stdout;
    context.stdout = (text: string) => {
      captured.push(text);
      // On first stdout call, open a tool segment for the rolling window
      if (!segmentOpened) {
        segmentOpened = true;
        const callChunk: StreamChunk = {
          type: "tool-call",
          toolName: commandId,
          args,
        };
        streamParts.push(formatStreamChunk(callChunk));
        sessionRef?.onStreamChunk?.(callChunk, streamParts.join(""));
      }
      // Stream as tool-output so the REPL shows it in the rolling window
      const chunk: StreamChunk = {
        type: "tool-output",
        toolName: commandId,
        text,
      };
      streamParts.push(formatStreamChunk(chunk));
      sessionRef?.onStreamChunk?.(chunk, streamParts.join(""));
    };
    try {
      const result = await cli.execute(commandId, args, context);
      context.stdout = origStdout;
      if (isSkillInvocation(result)) {
        return handleAgentPrompt(renderSkillPromptFromInvocation(result));
      }
      const text = formatResult(result);

      // Close the tool segment if one was opened
      if (segmentOpened) {
        const resultChunk: StreamChunk = {
          type: "tool-result",
          toolName: commandId,
          result: { text },
          isError: false,
        };
        streamParts.push(formatStreamChunk(resultChunk));
        sessionRef?.onStreamChunk?.(resultChunk, streamParts.join(""));
      }

      const rendered = renderMarkdown(text);
      const prefix = captured.length > 0 ? captured.join("") : "";
      const combined =
        prefix && rendered ? prefix + rendered : prefix + rendered;
      return { text: combined, type: "result" };
    } catch (err: unknown) {
      context.stdout = origStdout;
      throw err;
    }
  }

  /**
   * Return the next prompt output for the current prompting state,
   * or execute the command if all fields are collected.
   */
  async function advancePrompt(): Promise<ReplOutput> {
    const state = prompting!;
    if (state.remainingFields.length === 0) {
      // All fields collected — execute the command
      const { commandId, collectedArgs } = state;
      prompting = null;
      try {
        const cmd = cli.getCommand(commandId);
        const args = cli.parseArgs(
          commandId,
          argsToArgv(collectedArgs, cmd?.positional),
        );
        return await executeCommandWithCapture(commandId, args);
      } catch (err: unknown) {
        const msg = formatZodError(err, commandId);
        return { text: msg, type: "error" };
      }
    }

    // Prompt for the next field
    const field = state.remainingFields[0]!;
    const promptText = buildPromptText(field);
    return { text: promptText, type: "prompt", promptLabel: field.key };
  }

  /**
   * Convert a collected args map back to argv-style tokens for parseArgs.
   * Positional fields are emitted first, in declared order, then flags.
   */
  function argsToArgv(
    args: Record<string, unknown>,
    positional?: readonly string[],
  ): string[] {
    const argv: string[] = [];
    const positionalKeys = positional ?? [];
    const positionalSet = new Set(positionalKeys);

    for (const key of positionalKeys) {
      const value = args[key];
      if (value === undefined || value === null || value === "") break;
      argv.push(String(value));
    }
    for (const [key, value] of Object.entries(args)) {
      if (positionalSet.has(key)) continue;
      if (typeof value === "boolean") {
        if (value) argv.push(`--${key}`);
      } else if (value !== undefined && value !== null && value !== "") {
        argv.push(`--${key}`, String(value));
      }
    }
    return argv;
  }

  async function handlePromptAnswer(input: string): Promise<ReplOutput> {
    if (!prompting) return { text: "", type: "empty" };

    const field = prompting.remainingFields[0]!;
    const trimmed = input.trim();

    if (trimmed === "" && field.hasDefault) {
      // Accept default — don't add to collected args, parseArgs will apply the default
    } else if (trimmed === "" && (field.isOptional || field.hasDefault)) {
      // Skip optional field
    } else if (trimmed === "") {
      // Required field with no default — re-prompt
      return {
        text: `${field.key} is required`,
        type: "prompt",
        promptLabel: field.key,
      };
    } else if (field.baseType === "boolean") {
      prompting.collectedArgs[field.key] =
        trimmed === "true" || trimmed === "1" || trimmed === "yes";
    } else {
      prompting.collectedArgs[field.key] = trimmed;
    }

    // Move to next field
    prompting.remainingFields = prompting.remainingFields.slice(1);
    return advancePrompt();
  }

  async function processInput(input: string): Promise<ReplOutput> {
    // If we're in prompting mode, handle the input as a prompt answer
    if (prompting) {
      return handlePromptAnswer(input);
    }

    const parsed = parseReplInput(input, commandIds, hasDefaultCommand);

    switch (parsed.type) {
      case "empty":
        return { text: "", type: "empty" };

      case "exit":
        return { text: buildExitMessage(), type: "exit" };

      case "text":
        return handleAgentPrompt(parsed.raw);

      case "unknown":
        if (parsed.commandId) {
          return {
            text: `Unknown command: /${parsed.commandId}. Type /cli-docs for available commands.`,
            type: "error",
          };
        }
        return {
          text: "Commands start with /. Type /cli-docs for available commands.",
          type: "error",
        };

      case "command": {
        // Intercept /{id}-manage → open interactive panel for that service
        if (parsed.commandId?.endsWith("-manage")) {
          const serviceId = parsed.commandId.slice(0, -"-manage".length);
          if (!context.services?.getDefinition(serviceId)) {
            return { text: `Unknown service: ${serviceId}`, type: "error" };
          }
          return { text: "", type: "panel", panelId: `services:${serviceId}` };
        }

        const cmdForKeys = cli.getCommand(parsed.commandId!);
        const explicitKeys = getExplicitKeys(
          parsed.args!,
          cmdForKeys?.positional,
        );

        try {
          // Parse provided args first
          const args = cli.parseArgs(parsed.commandId!, parsed.args!);

          // Check if any fields need prompting
          const fieldsToPrompt = getFieldsToPrompt(
            parsed.commandId!,
            explicitKeys,
            cli,
          );

          if (fieldsToPrompt.length > 0) {
            // Enter prompting mode
            prompting = {
              commandId: parsed.commandId!,
              collectedArgs: { ...args },
              remainingFields: fieldsToPrompt,
            };
            return advancePrompt();
          }

          // No prompting needed — execute directly
          return await executeCommandWithCapture(parsed.commandId!, args);
        } catch (err: unknown) {
          const msg = formatZodError(err, parsed.commandId!);

          // If the error is about a missing required field and the command has prompt config,
          // enter prompting mode with what we have
          const cmd = cli.getCommand(parsed.commandId!);
          if (
            cmd?.prompt &&
            (msg.includes("Missing required option") ||
              msg.includes("Missing required argument"))
          ) {
            const partialArgs = parseArgsPartial(parsed.args!, cmd);
            const fieldsToPrompt = getFieldsToPrompt(
              parsed.commandId!,
              explicitKeys,
              cli,
            );

            if (fieldsToPrompt.length > 0) {
              prompting = {
                commandId: parsed.commandId!,
                collectedArgs: partialArgs,
                remainingFields: fieldsToPrompt,
              };
              return advancePrompt();
            }
          }

          return { text: msg, type: "error" };
        }
      }
    }
  }

  /**
   * Parse args without throwing on missing required fields.
   * Used to collect whatever args were provided before entering prompting.
   */
  function parseArgsPartial(
    argv: string[],
    cmd: ReturnType<typeof cli.getCommand>,
  ): Record<string, unknown> {
    if (!cmd) return {};
    const fields = getSchemaFields(cmd.inputSchema);
    const positionalKeys = cmd.positional ?? [];
    const result: Record<string, unknown> = {};
    let positionalIdx = 0;

    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i]!;
      if (!arg.startsWith("--")) {
        if (positionalIdx < positionalKeys.length) {
          result[positionalKeys[positionalIdx]!] = arg;
          positionalIdx++;
        }
        continue;
      }

      const flagName = arg.slice(2);
      const field = fields.find((f) => f.key === flagName);
      if (!field) continue;

      if (field.baseType === "boolean") {
        result[field.key] = true;
      } else {
        const nextArg = argv[i + 1];
        if (nextArg !== undefined && !nextArg.startsWith("--")) {
          result[field.key] = nextArg;
          i++;
        }
      }
    }

    // Apply defaults for non-prompted fields
    for (const field of fields) {
      if (field.key in result) continue;
      if (
        field.hasDefault &&
        !cmd.prompt?.promptOptional?.includes(field.key) &&
        !cmd.prompt?.promptForDefaults
      ) {
        result[field.key] = field.defaultValue;
      }
    }

    return result;
  }

  /**
   * Head-crop a tool-result body: keep at most `windowSize` lines,
   * append truncation indicator if exceeded.
   */
  function cropToolBody(body: string, windowSize: number): string {
    const lines = body.split("\n");
    if (lines.length <= windowSize) return body;
    const kept = lines.slice(0, windowSize);
    const omitted = lines.length - windowSize;
    kept.push(`\x1b[2m... (${omitted} more lines)\x1b[0m`);
    return kept.join("\n");
  }

  /**
   * Format a tool-result chunk for the history result.
   * Status line + cropped body, as pre-formatted (non-markdown) text.
   */
  function formatToolResult(
    chunk: StreamChunk & { type: "tool-result" },
    windowSize: number,
  ): string {
    const formatted = formatStreamChunk(chunk).trim();
    // formatStreamChunk for tool-result with text body: "✓ name\nbody"
    // without text body: "✓ name → result"
    const nlIdx = formatted.indexOf("\n");
    if (nlIdx === -1) return formatted; // single-line result, no cropping
    const statusLine = formatted.slice(0, nlIdx);
    const body = formatted.slice(nlIdx + 1);
    return statusLine + "\n" + cropToolBody(body, windowSize);
  }

  async function handleAgentPrompt(text: string): Promise<ReplOutput> {
    if (!agentProvider) {
      return {
        text: "Agent not available",
        type: "error",
      };
    }

    try {
      // Accumulate chunks as typed segments: text (agent prose) vs tool (pre-formatted)
      const segments: { content: string; isText: boolean }[] = [];
      const commandMap = new Map(commands.map((c) => [c.id, c]));
      currentAbortController = new AbortController();
      const stream = agentProvider.stream(text, {
        threadId,
        tools: commandMap,
        abortSignal: currentAbortController.signal,
      });
      const windowSize = sessionRef?.outputWindow ?? 6;

      // For the onStreamChunk callback, maintain a running formatted string
      const streamParts: string[] = [];

      // Track tool segments by index for matching results to calls
      interface ToolSeg {
        index: number;
        toolCallId?: string;
        toolName: string;
        complete: boolean;
      }
      const toolSegs: ToolSeg[] = [];

      context._onToolOutput = (toolName: string, outputText: string) => {
        const toolOutputChunk: StreamChunk = {
          type: "tool-output",
          toolName,
          text: outputText,
        };
        const display = formatStreamChunk(toolOutputChunk);

        // Find the incomplete tool segment to append to
        const match =
          toolSegs.find((t) => !t.complete && t.toolName === toolName) ??
          toolSegs.find((t) => !t.complete);
        if (match) {
          segments[match.index]!.content += display;
        }

        streamParts.push(display);
        sessionRef?.onStreamChunk?.(toolOutputChunk, streamParts.join(""));
      };

      for await (const chunk of stream) {
        const isText = chunk.type === "text-delta";
        let display: string;

        if (chunk.type === "tool-result") {
          display = formatToolResult(
            chunk as StreamChunk & { type: "tool-result" },
            windowSize,
          );
        } else {
          display = formatStreamChunk(chunk);
        }

        if (chunk.type === "tool-call") {
          // Each tool-call starts a new tool segment
          segments.push({ content: display, isText: false });
          toolSegs.push({
            index: segments.length - 1,
            toolCallId: chunk.toolCallId,
            toolName: chunk.toolName,
            complete: false,
          });
        } else if (chunk.type === "tool-result") {
          // Match by toolCallId (exact), then toolName (FIFO), then any incomplete
          const match =
            (chunk.toolCallId
              ? toolSegs.find(
                  (t) => !t.complete && t.toolCallId === chunk.toolCallId,
                )
              : undefined) ??
            toolSegs.find(
              (t) => !t.complete && t.toolName === chunk.toolName,
            ) ??
            toolSegs.find((t) => !t.complete);
          if (match) {
            segments[match.index]!.content += display;
            match.complete = true;
          } else {
            segments.push({ content: display, isText: false });
          }
        } else if (isText) {
          // Merge consecutive text-deltas
          const last = segments[segments.length - 1];
          if (last && last.isText) {
            last.content += display;
          } else {
            segments.push({ content: display, isText: true });
          }
        } else {
          // Error chunks: append to last segment or create new
          const last = segments[segments.length - 1];
          if (last && !last.isText) {
            last.content += display;
          } else {
            segments.push({ content: display, isText: false });
          }
        }

        // Feed streaming callback with running text
        streamParts.push(display);
        sessionRef?.onStreamChunk?.(chunk, streamParts.join(""));
      }

      context._onToolOutput = undefined;
      currentAbortController = null;

      // Build final result: render only text segments as markdown,
      // keep tool segments as pre-formatted with ⎿ indentation.
      // Trim each segment to remove \n padding from formatStreamChunk,
      // then join with \n\n so segments have visual separation.
      const rendered = segments
        .map((seg) => {
          const trimmed = seg.content.trim();
          if (seg.isText) return renderMarkdown(trimmed);
          // Indent tool output: ⎿ on first body line, continuation on rest
          const lines = trimmed.split("\n");
          return lines
            .map((line, j) => {
              if (j === 0) return line; // ▶ header — no indent
              if (j === 1) return " ⎿ " + line; // first body line (✓ status)
              return "   " + line; // continuation lines
            })
            .join("\n");
        })
        .filter((s) => s !== "")
        .join("\n\n");
      return { text: rendered, type: "result" };
    } catch (err: unknown) {
      currentAbortController = null;
      // AbortError is a clean interruption, not an error to display
      if (err instanceof Error && err.name === "AbortError") {
        return { text: "(interrupted)", type: "result" };
      }
      const msg = err instanceof Error ? err.message : String(err);
      return { text: msg, type: "error" };
    }
  }

  const session: ReplSession = {
    processInput,
    getCompletions: (partial: string) =>
      prompting ? [] : getCompletions(partial, commands),
    getGhostSuggestion: (input: string) =>
      prompting ? null : getGhostSuggestion(input, commands),
    getCompletionSuffix: (completion: string, input: string) =>
      getCompletionSuffix(completion, input, commands),
    get isPrompting() {
      return prompting !== null;
    },
    welcome:
      typeof cli.interactive?.welcome === "function"
        ? undefined
        : cli.interactive?.welcome,
    get exitMessage() {
      return buildExitMessage();
    },
    outputWindow:
      (cli.interactive && "outputWindow" in cli.interactive
        ? (cli.interactive as { outputWindow?: number }).outputWindow
        : undefined) ?? 6,
    abortCurrentStream() {
      if (currentAbortController) {
        // Temporarily suppress Mastra's internal "Error in LLM execution" console.error
        const origError = console.error;
        console.error = (...args: unknown[]) => {
          const first = args[0];
          if (
            typeof first === "string" &&
            first.includes("Error in LLM execution")
          )
            return;
          origError.apply(console, args);
        };
        currentAbortController.abort();
        currentAbortController = null;
        // Restore after a tick (Mastra logs asynchronously)
        setTimeout(() => {
          console.error = origError;
        }, 100);
      }
    },
  };
  sessionRef = session;

  return session;
}
