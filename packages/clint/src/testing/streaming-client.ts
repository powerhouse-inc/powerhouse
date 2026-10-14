import type { Cli, RunOptions } from "../core/types.js";

/**
 * Test harness for interactive-streaming mode.
 * Wraps `cli.run()` with controllable I/O for programmatic testing.
 */
export interface InteractiveStreamingClient {
  /** Push a line of input (as if typed + Enter). */
  writeInput(line: string): void;
  /** Close the input stream (EOF). */
  sendEOF(): void;
  /** Emit SIGINT to unblock keep-alive. */
  sendKillSignal(): void;
  /** All stdout lines collected so far. */
  readonly output: string[];
  /** All stderr lines collected so far. */
  readonly errors: string[];
  /** Exit code once the process exits, undefined while running. */
  readonly exitCode: number | undefined;
  /** Promise that resolves when cli.run() completes. */
  readonly done: Promise<void>;
}

/**
 * Create an InteractiveStreamingClient that drives a CLI in interactive-streaming mode.
 *
 * @param cli - The CLI instance to test
 * @param argv - The argument vector (must include `-i`)
 * @param runOptions - Additional RunOptions overrides (stdout/stderr/exit are managed by the client)
 */
export function createStreamingClient(
  cli: Cli,
  argv: string[],
  runOptions?: Partial<
    Omit<RunOptions, "stdout" | "stderr" | "exit" | "interactiveInput">
  >,
): InteractiveStreamingClient {
  const output: string[] = [];
  const errors: string[] = [];
  let exitCode: number | undefined;

  // Async generator backed by a queue
  let pendingResolve: ((value: IteratorResult<string>) => void) | undefined;
  let closed = false;
  const queue: string[] = [];

  async function* inputGenerator(): AsyncGenerator<string> {
    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (closed) return;
      const result = await new Promise<IteratorResult<string>>((resolve) => {
        pendingResolve = resolve;
      });
      pendingResolve = undefined;
      if (result.done) return;
      yield result.value;
    }
  }

  const done = cli.run(argv, {
    ...runOptions,
    stdout: (msg: string) => output.push(msg),
    stderr: (msg: string) => errors.push(msg),
    exit: (code: number) => {
      exitCode = code;
    },
    interactiveInput: inputGenerator(),
  });

  return {
    writeInput(line: string) {
      if (closed) throw new Error("Input stream is closed");
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = undefined;
        resolve({ value: line, done: false });
      } else {
        queue.push(line);
      }
    },
    sendEOF() {
      closed = true;
      if (pendingResolve) {
        const resolve = pendingResolve;
        pendingResolve = undefined;
        resolve({ value: undefined as any, done: true });
      }
    },
    sendKillSignal() {
      process.emit("SIGINT" as any);
    },
    get output() {
      return output;
    },
    get errors() {
      return errors;
    },
    get exitCode() {
      return exitCode;
    },
    get done() {
      return done;
    },
  };
}
