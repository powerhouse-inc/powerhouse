import React, { useState, useCallback, useRef, useEffect } from "react";
import { Box, Text, Static, useInput, useApp, useStdout } from "ink";
import Spinner from "ink-spinner";
import type { ReplSession, HistoryEntry } from "./types.js";
import type { ServiceManager, StreamChunk } from "../core/types.js";
import { formatStreamChunk } from "../core/stream.js";
import { renderMarkdown } from "./markdown.js";
import { applyCompletion } from "./completions.js";
import { TextInput } from "./text-input.js";
import { ServicePanel } from "./service-panel.js";
import { useOutputThrottle } from "./output-throttle.js";

interface ReplProps {
  session: ReplSession;
  services?: ServiceManager;
  workdir?: string;
  /** Called after Ink mounts, before user input is accepted. The `append` function adds a system message to the Repl's display. */
  onStart?: (append: (msg: string) => void) => Promise<void>;
}

/**
 * Interaction mode for the useInput handler.
 * - 'typing': normal text input
 * - 'tab-cycling': Tab/Shift+Tab cycling through completions
 * - 'command-cycling': Up/Down cycling through command matches
 * - 'history-cycling': Up/Down cycling through history
 */
type InteractionMode = "typing" | "tab-cycling" | "history-cycling";

/** Default number of trailing lines shown in the rolling output window during streaming. */
const DEFAULT_OUTPUT_WINDOW = 6;

/** Number of lines revealed per chunk. */
const LINES_PER_CHUNK = 2;

/** Snap clip position to reveal lines in groups of LINES_PER_CHUNK.
 *  The last line (no trailing \n, i.e. actively streaming) renders char-by-char. */
function snapToLine(text: string, pos: number): number {
  if (pos <= 0) return 0;
  if (pos >= text.length) return text.length;
  // Count how many complete lines the budget covers
  let lines = 0;
  let idx = 0;
  while (idx < pos) {
    const nl = text.indexOf("\n", idx);
    if (nl < 0 || nl >= pos) break;
    lines++;
    idx = nl + 1;
  }
  // Round down to nearest multiple of LINES_PER_CHUNK
  const visibleLines = Math.floor(lines / LINES_PER_CHUNK) * LINES_PER_CHUNK;
  if (visibleLines === 0) return 0;
  // Find the position after the last visible line
  let end = 0;
  for (let i = 0; i < visibleLines; i++) {
    const nl = text.indexOf("\n", end);
    if (nl < 0) return end;
    end = nl + 1;
  }
  return end;
}

/** Prefix for the first line of indented tool output. */
const INDENT_FIRST = " ⎿ ";
/** Prefix for continuation lines of indented tool output. */
const INDENT_REST = "   ";

/** Strip ANSI escape codes for visible-width measurement. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Indent and truncate tool output lines for the rolling window.
 * First line gets ` ⎿ `, subsequent lines get `   `.
 * Lines are truncated to fit within `maxWidth` columns.
 */
function formatToolLines(lines: string[], maxWidth: number): string[] {
  return lines.map((line, i) => {
    const prefix = i === 0 ? INDENT_FIRST : INDENT_REST;
    const available = maxWidth - prefix.length;
    if (available <= 0) return prefix;
    const visible = stripAnsi(line);
    if (visible.length <= available) return prefix + line;
    // Truncate: find how many chars of the original string to keep
    // Walk the original string, tracking visible characters
    let visCount = 0;
    let cutIdx = line.length;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === "\x1b") {
        // Skip ANSI sequence
        const end = line.indexOf("m", j);
        if (end !== -1) {
          j = end;
          continue;
        }
      }
      visCount++;
      if (visCount >= available - 1) {
        // -1 for ellipsis
        cutIdx = j + 1;
        break;
      }
    }
    return prefix + line.slice(0, cutIdx) + "…";
  });
}

/** A logical segment of streaming output — either agent text or a tool call/result pair. */
interface StreamSegment {
  type: "text" | "tool";
  /** Formatted display lines accumulated in this segment. */
  lines: string[];
  /** Tool call ID for matching results to calls (from Vercel AI SDK). */
  toolCallId?: string;
  /** Tool name (for tool segments). */
  toolName?: string;
  /** Number of header lines (tool-call) pinned above the rolling window. */
  headerLines: number;
  /** Whether the tool segment has received its result. */
  complete: boolean;
}

/** Reducer: append a new StreamChunk to the segment list. */
function updateSegments(
  prev: StreamSegment[],
  chunk: StreamChunk,
): StreamSegment[] {
  const next = prev.map((s) => ({ ...s, lines: [...s.lines] }));

  switch (chunk.type) {
    case "text-delta": {
      const last = next[next.length - 1];
      if (last && last.type === "text") {
        // Append to existing text segment (join with \n to preserve line breaks)
        const text = last.lines.join("\n") + chunk.text;
        last.lines = text.split("\n");
      } else {
        // Start a new text segment
        next.push({
          type: "text",
          lines: chunk.text.split("\n"),
          headerLines: 0,
          complete: false,
        });
      }
      break;
    }
    case "tool-call": {
      // Strip leading/trailing \n from formatStreamChunk, keep only content lines
      const headerLines = formatStreamChunk(chunk)
        .split("\n")
        .filter((l) => l !== "");
      next.push({
        type: "tool",
        lines: headerLines,
        toolCallId: chunk.toolCallId,
        toolName: chunk.toolName,
        headerLines: headerLines.length,
        complete: false,
      });
      break;
    }
    case "tool-result": {
      // Strip empty lines from leading/trailing \n
      const resultLines = formatStreamChunk(chunk)
        .split("\n")
        .filter((l) => l !== "");
      // Match by toolCallId (exact), then toolName (FIFO), then any incomplete
      const toolSeg =
        (chunk.toolCallId
          ? next.find(
              (s) =>
                s.type === "tool" &&
                !s.complete &&
                s.toolCallId === chunk.toolCallId,
            )
          : undefined) ??
        next.find(
          (s) =>
            s.type === "tool" && !s.complete && s.toolName === chunk.toolName,
        ) ??
        next.find((s) => s.type === "tool" && !s.complete);
      if (toolSeg) {
        toolSeg.lines.push(...resultLines);
        toolSeg.complete = true;
      } else {
        next.push({
          type: "tool",
          lines: resultLines,
          toolCallId: chunk.toolCallId,
          toolName: chunk.toolName,
          headerLines: 0,
          complete: true,
        });
      }
      break;
    }
    case "tool-output": {
      const toolSeg = [...next]
        .reverse()
        .find((s) => s.type === "tool" && !s.complete);
      if (toolSeg) {
        const outputLines = chunk.text.split("\n").filter((l) => l !== "");
        toolSeg.lines.push(...outputLines);
      }
      break;
    }
    case "error": {
      const errorLines = formatStreamChunk(chunk)
        .split("\n")
        .filter((l) => l !== "");
      const last = next[next.length - 1];
      if (last) {
        last.lines.push(...errorLines);
      } else {
        next.push({
          type: "text",
          lines: errorLines,
          headerLines: 0,
          complete: false,
        });
      }
      break;
    }
  }

  return next;
}

/**
 * Main REPL component for interactive mode.
 */
/** Track terminal column width reactively across resize events. */
function useTerminalColumns(): { stdout: NodeJS.WriteStream; columns: number } {
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(stdout?.columns || 80);
  useEffect(() => {
    const onResize = () => setColumns(stdout?.columns || 80);
    stdout?.on("resize", onResize);
    return () => {
      stdout?.off("resize", onResize);
    };
  }, [stdout]);
  return { stdout: stdout as NodeJS.WriteStream, columns };
}

export function Repl({ session, services, workdir, onStart }: ReplProps) {
  const { exit } = useApp();
  const { stdout, columns } = useTerminalColumns();

  // Terminal focus tracking (DECSET 1004) — only on real TTYs
  const isTTY = "isTTY" in stdout && stdout.isTTY;
  const [terminalFocused, setTerminalFocused] = useState(true);
  useEffect(() => {
    if (!isTTY) return;
    stdout.write("\x1b[?1004h");
    return () => {
      stdout.write("\x1b[?1004l");
    };
  }, [stdout, isTTY]);

  const [phase, setPhase] = useState<
    "starting" | "idle" | "executing" | "panel"
  >(onStart ? "starting" : "idle");
  // Run onStart callback after mount — appends system messages to history, then transitions to idle
  useEffect(() => {
    if (!onStart) return;
    const append = (msg: string) =>
      setHistory((prev) => [
        ...prev,
        { id: -(prev.length + 1), input: "", output: msg, type: "result" },
      ]);
    onStart(append).then(
      () => setPhase("idle"),
      (err) => {
        append(`Error: ${err instanceof Error ? err.message : String(err)}`);
        setPhase("idle");
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [activePanelId, setActivePanelId] = useState<string | null>(null);
  // Seed history with welcome + system messages so they scroll with content
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    const initial: HistoryEntry[] = [];
    if (session.welcome) {
      initial.push({
        id: -1,
        input: "",
        output: session.welcome,
        type: "result",
      });
    }
    return initial;
  });
  const [input, setInput] = useState("");
  const [cursorOffset, setCursorOffset] = useState<number | undefined>(
    undefined,
  );
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [promptLabel, setPromptLabel] = useState<string | null>(null);
  const [segments, setSegments] = useState<StreamSegment[]>([]);
  const streamingFullRef = useRef("");
  const throttle = useOutputThrottle();
  const clipHighWaterRef = useRef(0);
  const [currentInput, setCurrentInput] = useState("");
  const nextId = useRef(0);
  const interruptedRef = useRef(false);

  // Subscribe to background service chunks — renders as rolling window segments.
  // Completed segments are flushed to history so they scroll up.
  // We do NOT subscribe to watchLogs here to avoid duplicating runProcess output
  // (runProcess lines go through both onChunk and onOutput for log buffer capture).
  useEffect(() => {
    if (!services) return;
    const cleanups: (() => void)[] = [];
    for (const inst of services.list()) {
      cleanups.push(
        services.watchChunks(inst.serviceId, inst.instanceId, (chunk) => {
          setSegments((prev) => {
            const next = updateSegments(prev, chunk);
            // When a tool-result arrives, check if all segments are complete.
            // Flush completed segments to history and clear them.
            if (chunk.type === "tool-result") {
              const allComplete = next.every(
                (s) => s.type === "text" || s.complete,
              );
              if (allComplete && next.length > 0) {
                const windowSize =
                  session.outputWindow ?? DEFAULT_OUTPUT_WINDOW;
                const DIM = "\x1b[2m";
                const RESET = "\x1b[0m";
                const historyText = next
                  .map((seg) => {
                    if (seg.type === "text")
                      return DIM + seg.lines.join("\n") + RESET;
                    const header = seg.lines.slice(0, seg.headerLines);
                    const body = seg.lines.slice(seg.headerLines);
                    const visibleBody = body.slice(-windowSize);
                    const hiddenCount = body.length - visibleBody.length;
                    const bodyParts: string[] = [];
                    if (hiddenCount > 0)
                      bodyParts.push(
                        `${INDENT_FIRST}... (${hiddenCount} more lines)`,
                      );
                    bodyParts.push(
                      ...visibleBody.map(
                        (l, i) =>
                          (i === 0 && hiddenCount === 0
                            ? INDENT_FIRST
                            : INDENT_REST) + l,
                      ),
                    );
                    return (
                      "\n" +
                      header.join("\n") +
                      (bodyParts.length > 0
                        ? "\n" + DIM + bodyParts.join("\n") + RESET
                        : "")
                    );
                  })
                  .join("\n");
                setHistory((prev) => [
                  ...prev,
                  {
                    id: -(prev.length + 1),
                    input: "",
                    output: historyText,
                    type: "result",
                  },
                ]);
                return [];
              }
            }
            return next;
          });
        }),
      );
    }
    return () => {
      for (const fn of cleanups) fn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  // Interaction mode tracking
  const [mode, setMode] = useState<InteractionMode>("typing");

  // Tab completion state
  const [tabIndex, setTabIndex] = useState<number | null>(null);
  const tabCompletionsRef = useRef<string[]>([]);
  const tabBaseInputRef = useRef("");

  // History cycling state
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [savedInput, setSavedInput] = useState("");

  // Reset to typing mode
  const resetToTyping = useCallback(() => {
    setMode("typing");
    setTabIndex(null);
    tabCompletionsRef.current = [];
    tabBaseInputRef.current = "";
    setHistoryIndex(null);
    setSavedInput("");
  }, []);

  // Set input and move cursor to end
  const setInputWithCursor = useCallback((value: string) => {
    setInput(value);
    setCursorOffset(value.length);
  }, []);

  const handleSubmit = useCallback(
    async (value: string) => {
      const trimmed = value.trim();
      // Allow empty submit during prompting (to accept defaults)
      if (!trimmed && !session.isPrompting) return;

      setInput("");
      setCursorOffset(0);
      setSuggestions([]);
      resetToTyping();
      setPhase("executing");
      setSegments([]);
      streamingFullRef.current = "";
      throttle.reset();
      clipHighWaterRef.current = 0;
      setCurrentInput(trimmed);
      interruptedRef.current = false;

      // Wire up streaming callback so chunks appear incrementally.
      // Text-delta chunks (agent streaming) go through the throttle for smooth
      // animation. All other chunks (tool-call, tool-output, tool-result, error)
      // are command output that should appear immediately.
      session.onStreamChunk = (chunk, fullText) => {
        streamingFullRef.current = fullText;
        setSegments((prev) => updateSegments(prev, chunk));
        const chunkLen =
          chunk.type === "text-delta" || chunk.type === "tool-output"
            ? chunk.text.length
            : formatStreamChunk(chunk).length;
        if (chunk.type === "text-delta") {
          throttle.addChars(chunkLen);
        } else {
          throttle.addImmediate(chunkLen);
        }
      };

      const result = await session.processInput(trimmed);

      // Wait for throttled output to finish rendering before clearing
      session.onStreamChunk = undefined;
      await throttle.waitForDrain();
      setSegments([]);
      streamingFullRef.current = "";

      // If the user pressed Escape during execution, the partial output
      // was already captured into history — skip adding a duplicate.
      if (interruptedRef.current) {
        interruptedRef.current = false;
        return;
      }

      if (result.type === "exit") {
        setHistory((h) => [
          ...h,
          {
            id: nextId.current++,
            input: trimmed,
            output: result.text,
            type: result.type,
          },
        ]);
        // Print goodbye directly — Ink tears down before React can render the state update
        if (result.text) {
          stdout.write(result.text + "\n\n");
        }
        exit();
        return;
      }

      if (result.type === "panel") {
        setHistory((h) => [
          ...h,
          { id: nextId.current++, input: trimmed, output: "", type: "empty" },
        ]);
        setActivePanelId(result.panelId ?? null);
        setPhase("panel");
        return;
      }

      if (result.type === "prompt") {
        // Show the user's input in history (if they typed something)
        if (trimmed) {
          setHistory((h) => [
            ...h,
            { id: nextId.current++, input: trimmed, output: "", type: "empty" },
          ]);
        }
        setPromptLabel(result.promptLabel ?? null);
        setPhase("idle");
        return;
      }

      // Clear prompt label when command completes
      setPromptLabel(null);

      setHistory((h) => [
        ...h,
        {
          id: nextId.current++,
          input: trimmed,
          output: result.text,
          type: result.type,
        },
      ]);
      setPhase("idle");
    },
    [session, exit, resetToTyping],
  );

  // Get unique history inputs (skip consecutive duplicates), most recent first
  const getUniqueHistory = useCallback(() => {
    const inputs: string[] = [];
    for (let i = history.length - 1; i >= 0; i--) {
      const h = history[i]!.input;
      if (inputs.length === 0 || inputs[inputs.length - 1] !== h) {
        inputs.push(h);
      }
    }
    return inputs;
  }, [history]);

  useInput(
    (ch, key) => {
      // Terminal focus reporting (DECSET 1004): \x1b[I = focus, \x1b[O = blur
      if (key.escape || ch === "[I" || ch === "[O") {
        if (ch === "I" || ch === "[I") {
          setTerminalFocused(true);
          return;
        }
        if (ch === "O" || ch === "[O") {
          setTerminalFocused(false);
          return;
        }
      }

      // Ctrl+C: print exit/resume message and quit
      if (key.ctrl && ch === "c") {
        stdout.write("\n" + session.exitMessage + "\n\n");
        exit();
        return;
      }

      if (phase !== "idle") {
        if (key.escape) {
          // Abort the running agent stream — cancels the LLM request
          if (phase === "executing") {
            interruptedRef.current = true;
            session.abortCurrentStream();
            setHistory((h) => [
              ...h,
              {
                id: nextId.current++,
                input: currentInput,
                output: streamingFullRef.current || "(interrupted)",
                type: "result" as const,
              },
            ]);
            setSegments([]);
            streamingFullRef.current = "";
          }
          setPhase("idle");
        }
        return;
      }

      // --- Tab/Shift+Tab: tab completion cycling ---
      if (key.tab) {
        // If currently cycling history, Tab accepts the recalled entry
        if (mode === "history-cycling") {
          resetToTyping();
          return;
        }

        const baseInput =
          mode === "tab-cycling" ? tabBaseInputRef.current : input;
        const completions =
          mode === "tab-cycling"
            ? tabCompletionsRef.current
            : session.getCompletions(baseInput);

        if (completions.length === 0) {
          // No completions — but if there's a ghost suggestion (e.g. closing quote), apply it
          const ghost = session.getGhostSuggestion(input);
          if (ghost) {
            setInputWithCursor(ghost);
          }
          return;
        }

        if (mode !== "tab-cycling") {
          tabBaseInputRef.current = input;
          tabCompletionsRef.current = completions;
          setMode("tab-cycling");
        }

        const nextIndex =
          tabIndex === null
            ? 0
            : key.shift
              ? (tabIndex - 1 + completions.length) % completions.length
              : (tabIndex + 1) % completions.length;

        setTabIndex(nextIndex);
        const completed =
          applyCompletion(baseInput, completions[nextIndex]!) +
          session.getCompletionSuffix(completions[nextIndex]!, baseInput);
        setInputWithCursor(completed);
        setSuggestions(completions);
        return;
      }

      // --- Up/Down arrow ---
      if (key.upArrow || key.downArrow) {
        // If already cycling history, continue in history mode
        if (mode === "history-cycling") {
          const uniqueHistory = getUniqueHistory();
          if (uniqueHistory.length === 0) return;

          if (key.upArrow) {
            if (
              historyIndex !== null &&
              historyIndex < uniqueHistory.length - 1
            ) {
              const next = historyIndex + 1;
              setHistoryIndex(next);
              setInputWithCursor(uniqueHistory[next]!);
            }
          } else {
            if (historyIndex !== null && historyIndex > 0) {
              const next = historyIndex - 1;
              setHistoryIndex(next);
              setInputWithCursor(uniqueHistory[next]!);
            } else if (historyIndex === 0) {
              setHistoryIndex(null);
              setInputWithCursor(savedInput);
              setMode("typing");
            }
          }
          return;
        }

        // If already tab-cycling, Up/Down cycles through the same list
        if (mode === "tab-cycling") {
          const baseInput = tabBaseInputRef.current;
          const completions = tabCompletionsRef.current;
          if (completions.length === 0) return;

          const idx = tabIndex ?? 0;
          const nextIndex = key.upArrow
            ? (idx - 1 + completions.length) % completions.length
            : (idx + 1) % completions.length;

          setTabIndex(nextIndex);
          const completed =
            applyCompletion(baseInput, completions[nextIndex]!) +
            session.getCompletionSuffix(completions[nextIndex]!, baseInput);
          setInputWithCursor(completed);
          setSuggestions(completions);
          return;
        }

        // Entering cycling mode from typing — try completions first
        if (input.startsWith("/")) {
          const completions = session.getCompletions(input);
          if (completions.length > 0) {
            tabBaseInputRef.current = input;
            tabCompletionsRef.current = completions;
            setMode("tab-cycling");

            const nextIndex = key.upArrow ? completions.length - 1 : 0;
            setTabIndex(nextIndex);
            const completed =
              applyCompletion(input, completions[nextIndex]!) +
              session.getCompletionSuffix(completions[nextIndex]!, input);
            setInputWithCursor(completed);
            setSuggestions(completions);
            return;
          }
        }

        // Enter history cycling mode
        if (key.upArrow) {
          const uniqueHistory = getUniqueHistory();
          if (uniqueHistory.length === 0) return;

          setMode("history-cycling");
          setSavedInput(input);
          setHistoryIndex(0);
          setInputWithCursor(uniqueHistory[0]!);
          setSuggestions([]);
          setTabIndex(null);
          tabCompletionsRef.current = [];
        }
        return;
      }

      // --- Escape: cancel current cycling or do nothing ---
      if (key.escape) {
        if (mode === "history-cycling") {
          setInputWithCursor(savedInput);
          resetToTyping();
          return;
        }
        if (mode === "tab-cycling") {
          resetToTyping();
          return;
        }
        return;
      }
    },
    { isActive: true },
  );

  // Compute inline ghost suggestion for the current input
  const inlineSuggestion =
    mode === "typing" && phase === "idle"
      ? (session.getGhostSuggestion(input) ?? "")
      : "";

  // Update suggestions as user types (resets to typing mode)
  const handleChange = useCallback(
    (value: string) => {
      setInput(value);
      setCursorOffset(undefined);
      resetToTyping();
      if (value.startsWith("/")) {
        const completions = session.getCompletions(value);
        setSuggestions(completions);
      } else {
        setSuggestions([]);
      }
    },
    [session, resetToTyping],
  );

  return (
    <Box flexDirection="column">
      {/* Immutable history — welcome, system messages, and conversation entries */}
      <Static items={history}>
        {(entry) => (
          <Box key={entry.id} flexDirection="column" marginBottom={1}>
            {entry.input ? (
              <>
                <Text> </Text>
                <Text backgroundColor="#333333" color="#eeeeee">
                  {" > "}
                  {entry.input}{" "}
                </Text>
                <Text> </Text>
              </>
            ) : null}
            {entry.output ? (
              <Text
                color={entry.type === "error" ? "red" : undefined}
                bold={entry.id < 0}
              >
                {entry.output}
              </Text>
            ) : null}
          </Box>
        )}
      </Static>

      {/* Current execution, panel, starting, or input */}
      {phase === "starting" ? (
        <Box>
          <Text color="yellow">
            <Spinner type="dots" />
          </Text>
          <Text> Starting…</Text>
        </Box>
      ) : phase === "panel" &&
        activePanelId?.startsWith("services:") &&
        services ? (
        <ServicePanel
          services={services}
          serviceId={activePanelId.split(":")[1]}
          workdir={workdir}
          onExit={() => {
            setActivePanelId(null);
            setPhase("idle");
          }}
        />
      ) : phase === "executing" ? (
        <Box flexDirection="column">
          <Text> </Text>
          <Text backgroundColor="#333333" color="#eeeeee">
            {" > "}
            {currentInput}{" "}
          </Text>
          <Text> </Text>
          {segments.length > 0 ? (
            <Box flexDirection="column">
              {(() => {
                let charBudget = throttle.visibleChars;
                return segments.map((seg, i) => {
                  if (charBudget <= 0) return null;
                  const isLast = i === segments.length - 1;
                  const windowSize =
                    session.outputWindow ?? DEFAULT_OUTPUT_WINDOW;

                  if (seg.type === "text") {
                    if (!isLast) {
                      // Earlier text block: first line only, dimmed
                      const line = seg.lines[0] ?? "";
                      charBudget -= line.length;
                      return (
                        <Text key={i} dimColor>
                          {line}
                        </Text>
                      );
                    }
                    // Active text segment: clip to remaining budget (whole lines), render markdown
                    const rawText = seg.lines.join("\n");
                    const snapped = snapToLine(rawText, Math.ceil(charBudget));
                    const clipPos = Math.max(snapped, clipHighWaterRef.current);
                    clipHighWaterRef.current = clipPos;
                    const clipped = rawText.slice(0, clipPos);
                    charBudget -= Math.min(
                      Math.ceil(charBudget),
                      rawText.length,
                    );
                    return (
                      <Text key={i}>{renderMarkdown(clipped) || clipped}</Text>
                    );
                  }

                  // Tool segment: header unindented, body indented with ⎿
                  const header = seg.lines.slice(0, seg.headerLines);
                  const body = seg.lines.slice(seg.headerLines);
                  const visibleBody = body.slice(-windowSize);
                  const hiddenCount = body.length - visibleBody.length;

                  const parts: string[] = [];
                  parts.push(...header);
                  if (hiddenCount > 0) {
                    parts.push(
                      INDENT_FIRST +
                        `\x1b[2m... (${hiddenCount} more lines)\x1b[0m`,
                    );
                    parts.push(...visibleBody.map((l) => INDENT_REST + l));
                  } else {
                    parts.push(...formatToolLines(visibleBody, columns));
                  }

                  const fullText = parts.join("\n");
                  const snapped = snapToLine(fullText, Math.ceil(charBudget));
                  const clipPos = Math.max(snapped, clipHighWaterRef.current);
                  clipHighWaterRef.current = clipPos;
                  const clipped = fullText.slice(0, clipPos);
                  charBudget -= Math.min(
                    Math.ceil(charBudget),
                    fullText.length,
                  );

                  const dimmed = seg.complete && !isLast;
                  const leading = "\n";
                  const trailing = seg.complete && !isLast ? "\n" : "";
                  return (
                    <Text key={i} dimColor={dimmed}>
                      {leading}
                      {clipped}
                      {trailing}
                    </Text>
                  );
                });
              })()}
            </Box>
          ) : (
            <Box>
              <Text color="yellow">
                <Spinner type="dots" />
              </Text>
              <Text> Working…</Text>
            </Box>
          )}
        </Box>
      ) : null}

      {/* Background activity segments — visible during idle when background processes are running */}
      {phase === "idle" && segments.length > 0 && (
        <Box flexDirection="column">
          {segments.map((seg, i) => {
            const windowSize = session.outputWindow ?? DEFAULT_OUTPUT_WINDOW;
            if (seg.type === "text") {
              return (
                <Text key={i} dimColor>
                  {seg.lines.join("\n")}
                </Text>
              );
            }
            const header = seg.lines.slice(0, seg.headerLines);
            const body = seg.lines.slice(seg.headerLines);
            const visibleBody = body.slice(-windowSize);
            const hiddenCount = body.length - visibleBody.length;
            const bodyParts: string[] = [];
            if (hiddenCount > 0) {
              bodyParts.push(INDENT_FIRST + `... (${hiddenCount} more lines)`);
              bodyParts.push(...visibleBody.map((l) => INDENT_REST + l));
            } else {
              bodyParts.push(...formatToolLines(visibleBody, columns));
            }
            return (
              <Box key={i} flexDirection="column">
                <Text>
                  {"\n"}
                  {header.join("\n")}
                </Text>
                {bodyParts.length > 0 && (
                  <Text dimColor>{bodyParts.join("\n")}</Text>
                )}
              </Box>
            );
          })}
        </Box>
      )}

      {/* Input field — visible during idle and executing (deactivated while executing) */}
      {(phase === "idle" || phase === "executing") && (
        <Box flexDirection="column">
          <Text color="green">{"─".repeat(columns)}</Text>
          <Box>
            <Text color={promptLabel ? "cyan" : "green"}>
              {promptLabel ? `${promptLabel}: ` : "> "}
            </Text>
            <TextInput
              value={input}
              onChange={handleChange}
              onSubmit={handleSubmit}
              cursorOffset={cursorOffset}
              focus={terminalFocused && phase === "idle"}
              suggestion={phase === "idle" ? inlineSuggestion : undefined}
            />
          </Box>
          <Text color="green">{"─".repeat(columns)}</Text>
          {phase === "idle" && suggestions.length > 1 && (
            <Box marginLeft={2}>
              <Text dimColor>{suggestions.join("  ")}</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}
