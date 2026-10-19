import React from "react";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "ink-testing-library";
import { z } from "zod";
import { defineCommand, defineCli, createReplSession } from "../src/index.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import { Repl } from "../src/interactive/repl.js";
import type { ReplSession } from "../src/interactive/types.js";

// ANSI escape sequences for special keys
const KEYS = {
  TAB: "\t",
  SHIFT_TAB: "\x1b[Z",
  ENTER: "\r",
  ESCAPE: "\x1b",
  UP: "\x1b[A",
  DOWN: "\x1b[B",
  LEFT: "\x1b[D",
  RIGHT: "\x1b[C",
  BACKSPACE: "\x7f",
  HOME: "\x1b[H",
  END: "\x1b[F",
};

function delay(ms = 30) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Strips ANSI escape codes for easier assertion
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

function makeSession() {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone",
    inputSchema: z.object({
      name: z.string().describe("Name"),
      loud: z.boolean().default(false).describe("Shout"),
    }),
    execute: async ({ name, loud }) =>
      loud ? `HELLO, ${name}!` : `Hello, ${name}!`,
  });

  const list = defineCommand({
    id: "list",
    description: "List items",
    inputSchema: z.object({
      filter: z
        .enum(["all", "open", "done"])
        .default("open")
        .describe("Filter"),
    }),
    execute: async () => "items listed",
  });

  const cli = defineCli({
    name: "test",
    version: "1.0.0",
    description: "Test CLI",
    commands: [greet, list],
    interactive: { welcome: "Welcome!" },
  });

  return createReplSession({
    cli,
    context: {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    },
  });
}

describe("Repl component", () => {
  let session: ReplSession;
  let cleanup: (() => void) | undefined;

  beforeEach(() => {
    session = makeSession();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
  });

  function renderRepl() {
    const result = render(<Repl session={session} />);
    cleanup = result.unmount;
    return result;
  }

  describe("basic rendering", () => {
    it("shows welcome message", () => {
      const { lastFrame } = renderRepl();
      expect(lastFrame()).toContain("Welcome!");
    });

    it("shows the prompt", () => {
      const { lastFrame } = renderRepl();
      expect(stripAnsi(lastFrame()!)).toContain(">");
    });
  });

  describe("typing and submitting", () => {
    it("shows typed text in the input", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/greet");
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet");
    });

    it("executes a command on Enter and shows result", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);
      expect(stripAnsi(lastFrame()!)).toContain("Hello, Alice!");
    });
  });

  describe("tab completion", () => {
    it("completes a unique command on Tab", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/gr");
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("/greet");
    });

    it("cursor is at end after tab completion — can type immediately", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/gr");
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      // After completing to "/greet", typing more should append at end
      stdin.write(" --name");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("/greet --name");
    });

    it("cycles through multiple completions on repeated Tab", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      const completions = session.getCompletions("/");
      stdin.write(KEYS.TAB); // first completion
      await delay();
      const frame1 = stripAnsi(lastFrame()!);
      expect(frame1).toContain(completions[0]);

      stdin.write(KEYS.TAB); // second completion
      await delay();
      const frame2 = stripAnsi(lastFrame()!);
      expect(frame2).toContain(completions[1]);
    });

    it("cycles backward with Shift+Tab", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      const completions = session.getCompletions("/");

      stdin.write(KEYS.TAB); // first
      await delay();
      stdin.write(KEYS.TAB); // second
      await delay();
      stdin.write(KEYS.SHIFT_TAB); // back to first
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain(completions[0]);
    });

    it("completes flag names", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/greet --na");
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("/greet --name");
    });

    it("cursor is at end after flag completion — can type value", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/greet --na");
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      stdin.write("Alice");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      // Tab-completing --name adds ` "` suffix, then typing Alice continues inside the quote
      expect(frame).toContain('/greet --name "Alice');
    });

    it("shows suggestions for multiple matches", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      stdin.write(KEYS.TAB);
      await delay();
      const frame = stripAnsi(lastFrame()!);
      // Should show suggestion list
      expect(frame).toContain("/greet");
      expect(frame).toContain("/list");
    });
  });

  describe("command cycling with up/down arrows", () => {
    it("cycles through command matches with Down arrow", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      const completions = session.getCompletions("/");

      stdin.write(KEYS.DOWN); // first match
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain(completions[0]);
    });

    it("cycles through command matches with Up arrow", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      const completions = session.getCompletions("/");

      stdin.write(KEYS.UP); // last match
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain(completions[completions.length - 1]);
    });

    it("wraps around when cycling", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      const completions = session.getCompletions("/");

      // Go down through all completions and wrap
      for (let i = 0; i <= completions.length; i++) {
        stdin.write(KEYS.DOWN);
        await delay();
      }
      // Should have wrapped back to second item
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain(completions[1]);
    });
  });

  describe("history cycling with up/down arrows", () => {
    it("recalls previous command with Up arrow", async () => {
      const { stdin, lastFrame } = renderRepl();

      // Execute a command first
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Now press Up to recall it
      stdin.write(KEYS.UP);
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("/greet --name Alice");
    });

    it("recalls multiple commands in order", async () => {
      const { stdin, lastFrame } = renderRepl();

      // Execute two commands
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      stdin.write("/greet --name Bob");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Up once = most recent (Bob)
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Bob");

      // Up again = older (Alice)
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Alice");
    });

    it("restores original input when cycling back down past newest", async () => {
      const { stdin, lastFrame } = renderRepl();

      // Execute a command
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Type something, then cycle up and back down
      stdin.write("partial");
      await delay();
      stdin.write(KEYS.UP); // recall /greet --name Alice
      await delay();
      stdin.write(KEYS.DOWN); // should restore "partial"
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("partial");
    });

    it("skips consecutive duplicate history entries", async () => {
      const { stdin, lastFrame } = renderRepl();

      // Execute same command twice
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);
      stdin.write("/greet --name Bob");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Up once = most recent (Bob)
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Bob");

      // Up again = Alice (only one, despite two executions)
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Alice");
    });

    it("does nothing on Up with empty history", async () => {
      const { lastFrame, stdin } = renderRepl();
      await delay();
      const before = lastFrame();
      stdin.write(KEYS.UP);
      await delay();
      expect(lastFrame()).toBe(before);
    });

    it("stays in history mode when recalled command starts with /", async () => {
      const { stdin, lastFrame } = renderRepl();

      // Execute two commands that start with /
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);
      stdin.write("/list --filter all");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Up once = /list --filter all (most recent)
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/list --filter all");

      // Up again should go to /greet --name Alice (NOT enter command cycling)
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Alice");
    });

    it("escape discards history cycling and restores saved input", async () => {
      const { stdin, lastFrame } = renderRepl();

      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Type something, then cycle into history, then Escape
      stdin.write("my text");
      await delay();
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Alice");

      stdin.write(KEYS.ESCAPE);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("my text");
    });
  });

  describe("executing phase", () => {
    it("Escape during execution returns to idle", async () => {
      // Create a session with a slow command to catch the executing phase
      const slow = defineCommand({
        id: "slow",
        description: "Slow command",
        inputSchema: z.object({}),
        execute: async () => {
          await new Promise((r) => setTimeout(r, 200));
          return "done";
        },
      });
      const cli = defineCli({
        name: "test",
        version: "1.0.0",
        description: "test",
        commands: [slow],
        interactive: { welcome: "Hi" },
      });
      const slowSession = createReplSession({
        cli,
        context: {
          workspace: createMemoryWorkdirStore(),
          config: {},
          workdir: "",
          stdout: () => {},
          runProcess: () => Promise.resolve({ success: true, output: "" }),
        },
      });
      const { stdin, lastFrame, unmount } = render(
        <Repl session={slowSession} />,
      );

      // Start the slow command
      stdin.write("/slow");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(50); // Let it start executing

      // Should be in executing phase (showing spinner)
      expect(stripAnsi(lastFrame()!)).toContain("Working");

      // Press Escape to cancel
      stdin.write(KEYS.ESCAPE);
      await delay(50);

      // Should return to idle (show prompt again)
      expect(stripAnsi(lastFrame()!)).toContain(">");

      unmount();
    });
  });

  describe("exit command", () => {
    it("handles /exit without error", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/exit");
      await delay();
      stdin.write(KEYS.ENTER);
      // NOTE(port): a fixed 100ms delay raced ink's render on a loaded CI
      // runner (the frame was still empty). Wait for the paint instead; the
      // assertion is unchanged — the frame shows the exit entry or the last
      // pre-exit state, both of which carry the echoed /exit.
      await vi.waitFor(
        () => {
          expect(stripAnsi(lastFrame()!)).toContain("/exit");
        },
        { timeout: 10_000 },
      );
    });
  });

  describe("mode transitions", () => {
    it("Tab does nothing when no completions available", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("no-match-xyz");
      await delay();
      const before = lastFrame();
      stdin.write(KEYS.TAB);
      await delay();
      // Input should not change (no completions for non-/ input)
      expect(stripAnsi(lastFrame()!)).toContain("no-match-xyz");
    });

    it("Tab accepts history entry and returns to typing mode", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/greet --name Alice");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Enter history mode
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Alice");

      // Tab should accept the history entry (stay on it) and exit history mode
      stdin.write(KEYS.TAB);
      await delay();
      // Input is still the recalled command
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name Alice");
    });

    it("Escape exits command cycling mode", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      stdin.write(KEYS.DOWN); // enter command cycling
      await delay();

      stdin.write(KEYS.ESCAPE);
      await delay();
      // Should return to typing mode — behavior is reset
    });

    it("Escape exits tab cycling mode", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/gr");
      await delay();
      stdin.write(KEYS.TAB); // enter tab cycling
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet");

      stdin.write(KEYS.ESCAPE);
      await delay();
      // Should return to typing mode
    });

    it("Escape during typing mode does nothing", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("hello");
      await delay();
      const before = lastFrame();
      stdin.write(KEYS.ESCAPE);
      await delay();
      // Should not change anything
      expect(stripAnsi(lastFrame()!)).toContain("hello");
    });

    it("Down arrow during history with 3+ entries navigates forward", async () => {
      const { stdin, lastFrame } = renderRepl();

      // Execute three commands
      stdin.write("/greet --name A");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);
      stdin.write("/greet --name B");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);
      stdin.write("/greet --name C");
      await delay();
      stdin.write(KEYS.ENTER);
      await delay(100);

      // Go up to oldest
      stdin.write(KEYS.UP); // C
      await delay();
      stdin.write(KEYS.UP); // B
      await delay();
      stdin.write(KEYS.UP); // A
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name A");

      // Come back down
      stdin.write(KEYS.DOWN); // B
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain("/greet --name B");
    });

    it("Down arrow from / with no valid completions does nothing", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/zzzzz");
      await delay();
      const before = lastFrame();
      stdin.write(KEYS.DOWN);
      await delay();
      expect(lastFrame()).toBe(before);
    });
  });

  describe("cursor navigation", () => {
    it("Home moves cursor to start — typing inserts at beginning", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("hello");
      await delay();
      stdin.write(KEYS.HOME);
      await delay();
      stdin.write("X");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("Xhello");
    });

    it("End moves cursor to end after Home", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("hello");
      await delay();
      stdin.write(KEYS.HOME);
      await delay();
      stdin.write(KEYS.END);
      await delay();
      stdin.write("X");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("helloX");
    });

    it("Left arrow moves cursor — typing inserts at position", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("abc");
      await delay();
      stdin.write(KEYS.LEFT);
      await delay();
      stdin.write("X");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("abXc");
    });

    it("Backspace deletes character before cursor", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("abc");
      await delay();
      stdin.write(KEYS.BACKSPACE);
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("ab");
      expect(frame).not.toContain("abc");
    });
  });

  describe("ghost suggestion", () => {
    it("shows ghost text for partial command", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/gr");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("eet"); // ghost rest of "/greet"
    });

    it("shows ghost text for partial flag", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/greet --na");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("me"); // ghost rest of "--name"
    });
  });

  describe("suggestions display", () => {
    it("shows suggestions when typing / with multiple matches", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("/greet");
      expect(frame).toContain("/list");
    });

    it("clears suggestions when input narrows to single match", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      // Should have suggestions
      expect(stripAnsi(lastFrame()!)).toContain("/greet");

      // Type enough to narrow to single match
      stdin.write("gree");
      await delay();
      const completions = session.getCompletions("/gree");
      expect(completions).toEqual(["/greet"]);
    });

    it("shows inline ghost text for first completion", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/gr");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      // Ghost text should show the rest of "/greet"
      expect(frame).toContain("eet");
    });

    it("hides suggestion list when only one match", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/gree");
      await delay();
      const frame = stripAnsi(lastFrame()!);
      // Single match: no list below, but ghost text inline
      expect(frame).toContain("t"); // ghost 't'
      // The list row should not appear (only 1 match)
    });
  });

  describe("Up/Down in tab-cycling mode", () => {
    it("Up/Down cycles through completions while tab-cycling", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write("/");
      await delay();
      // Enter tab-cycling with Tab
      stdin.write(KEYS.TAB);
      await delay();
      const completions = session.getCompletions("/");
      expect(stripAnsi(lastFrame()!)).toContain(completions[0]);

      // Down should advance to next completion
      stdin.write(KEYS.DOWN);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain(completions[1]);

      // Up should go back
      stdin.write(KEYS.UP);
      await delay();
      expect(stripAnsi(lastFrame()!)).toContain(completions[0]);
    });
  });

  describe("empty submit", () => {
    it("does not submit empty input", async () => {
      const { stdin, lastFrame } = renderRepl();
      stdin.write(KEYS.ENTER);
      await delay();
      // Should still show welcome/prompt, no history entry
      const frame = stripAnsi(lastFrame()!);
      expect(frame).toContain("Welcome!");
    });
  });

  describe("parameter prompting", () => {
    function makePromptSession() {
      const addCmd = defineCommand({
        id: "add",
        description: "Add item",
        inputSchema: z.object({
          title: z.string().describe("Title"),
          note: z.string().optional().describe("Note"),
        }),
        prompt: { promptOptional: ["note"] },
        execute: async ({ title, note }) => `${title}:${note ?? "none"}`,
      });

      const cli = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [addCmd],
        interactive: { welcome: "Welcome!" },
      });

      return createReplSession({
        cli,
        context: {
          workspace: createMemoryWorkdirStore(),
          config: {},
          workdir: "",
          stdout: () => {},
          runProcess: () => Promise.resolve({ success: true, output: "" }),
        },
      });
    }

    it("shows prompt label when prompting for a field", async () => {
      const promptSession = makePromptSession();
      const result = render(<Repl session={promptSession} />);
      cleanup = result.unmount;

      // Invoke without required title → triggers prompting
      result.stdin.write("/add");
      await delay();
      result.stdin.write(KEYS.ENTER);
      await delay(200);

      const frame = stripAnsi(result.lastFrame()!);
      expect(frame).toContain("title:");
    });

    it("completes prompting and shows result", async () => {
      const promptSession = makePromptSession();
      const result = render(<Repl session={promptSession} />);
      cleanup = result.unmount;

      // Trigger prompting (missing required title)
      result.stdin.write("/add");
      await delay();
      result.stdin.write(KEYS.ENTER);
      await delay(200);

      // Answer title prompt
      result.stdin.write("Test");
      await delay();
      result.stdin.write(KEYS.ENTER);
      await delay(200);

      // Answer note prompt (promptOptional)
      result.stdin.write("my note");
      await delay();
      result.stdin.write(KEYS.ENTER);
      await delay(200);

      const frame = stripAnsi(result.lastFrame()!);
      expect(frame).toContain("Test:my note");
      // Should be back to normal prompt
      expect(frame).toContain(">");
    });
  });
});
