import type { ReplSession } from "../interactive/types.js";

/**
 * Test harness for interactive-terminal mode.
 * Wraps ink-testing-library's render() with the Repl component.
 *
 * Operates at the Repl component level, not cli.run(), because faking
 * process.stdin.isTTY is impractical. The dispatch logic and startup
 * sequence are tested via the streaming client; the terminal client
 * tests Ink-specific UI behavior (rendering, key handling, visual output).
 */
export interface InteractiveTerminalClient {
  /** Write raw characters (including KEYS.ENTER, KEYS.TAB, etc.). */
  writeRaw(chars: string): void;
  /** Type a string and press Enter. */
  submit(line: string): void;
  /** Get the last rendered frame (stripped of ANSI). */
  lastFrame(): string;
  /** Unmount the Ink app. */
  unmount(): void;
}

/** ANSI escape sequences for special keys. */
export const KEYS = {
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
} as const;

/** Strip ANSI escape codes for easier assertion. */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

/**
 * Create an InteractiveTerminalClient that renders the Repl component
 * using ink-testing-library.
 *
 * @param session - A ReplSession created via createReplSession()
 * @param options - Optional configuration
 */
export async function createTerminalClient(
  session: ReplSession,
  options?: {
    /** Callback invoked after render, before returning the client. */
    onReady?: () => void | Promise<void>;
  },
): Promise<InteractiveTerminalClient> {
  // Dynamic imports — ink-testing-library and React are devDependencies
  const React = await import("react");
  const { render } = await import("ink-testing-library");
  const { Repl } = await import("../interactive/repl.js");

  const instance = render(React.createElement(Repl, { session }));

  if (options?.onReady) {
    await options.onReady();
  }

  return {
    writeRaw(chars: string) {
      instance.stdin.write(chars);
    },
    submit(line: string) {
      instance.stdin.write(line + KEYS.ENTER);
    },
    lastFrame(): string {
      return stripAnsi(instance.lastFrame() ?? "");
    },
    unmount() {
      instance.unmount();
    },
  };
}
