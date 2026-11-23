import { AsyncLocalStorage } from "node:async_hooks";
import { StringDecoder } from "node:string_decoder";
import { formatWithOptions } from "node:util";

/**
 * What a command writes straight to the process (`console.log`,
 * `process.stdout.write`), sent to the caller the command runs for.
 *
 * A command the running instance executes for another terminal gets its
 * output there through `ctx.stdout` and `ctx.log`. One that prints directly
 * would print on the instance's own terminal instead. {@link captureOutput}
 * runs such a command in a scope of its own: while it runs, direct writes
 * made by it, and by the work it awaits, go to its caller. The scope follows
 * the command's asynchronous calls, so two commands at once each keep their
 * own output, and everything the instance writes outside a command stays
 * where it was.
 *
 * The scope ends with the command. Work it left running (a timer, a
 * connection it opened) prints on the instance again from then on.
 */

/** Where a command's direct output goes. */
export interface OutputSink {
  stdout(text: string): void;
  stderr(text: string): void;
}

type StreamName = "stdout" | "stderr";

interface Scope {
  sink: OutputSink;
  /** False once the command ended: its late output is the instance's. */
  open: boolean;
  decoders: Partial<Record<StreamName, StringDecoder>>;
}

const scopes = new AsyncLocalStorage<Scope | undefined>();

/** The scope of the command that runs now, when it still takes output. */
function current(): Scope | undefined {
  const scope = scopes.getStore();
  return scope?.open ? scope : undefined;
}

/** Hands `text` to the caller. False when it could not be: the instance
 * then shows it. Runs outside the scope: what the delivery itself writes is
 * the instance's. */
function deliver(scope: Scope, stream: StreamName, text: string): boolean {
  try {
    scopes.run(undefined, () => scope.sink[stream](text));
    return true;
  } catch {
    return false;
  }
}

/** The console methods that print a formatted line, and where. */
const CONSOLE_METHODS = {
  log: "stdout",
  info: "stdout",
  debug: "stdout",
  error: "stderr",
  warn: "stderr",
} as const satisfies Record<string, StreamName>;

type WriteCallback = (error?: Error | null) => void;

function patchStream(name: StreamName): void {
  const stream = process[name];
  const write = stream.write;
  const patched = (...args: unknown[]): boolean => {
    const [chunk, encoding, callback] = args;
    const scope = current();
    if (!scope) {
      return Reflect.apply(write, stream, args) as boolean;
    }
    let text: string;
    if (typeof chunk === "string") {
      text = chunk;
    } else if (chunk instanceof Uint8Array) {
      // Bytes that end inside a character wait for the rest.
      const decoder = (scope.decoders[name] ??= new StringDecoder("utf8"));
      text = decoder.write(Buffer.from(chunk));
    } else {
      return Reflect.apply(write, stream, args) as boolean;
    }
    if (text !== "" && !deliver(scope, name, text)) {
      return Reflect.apply(write, stream, args) as boolean;
    }
    const done = typeof encoding === "function" ? encoding : callback;
    if (typeof done === "function") {
      process.nextTick(done as WriteCallback, null);
    }
    return true;
  };
  stream.write = patched as typeof stream.write;
}

function patchConsole(): void {
  const target = globalThis.console;
  for (const [method, stream] of Object.entries(CONSOLE_METHODS) as [
    keyof typeof CONSOLE_METHODS,
    StreamName,
  ][]) {
    // What the method is outside a command: the console's own, or whatever
    // replaced it since (a terminal UI that draws around logged lines).
    let outside = target[method] as (...args: unknown[]) => void;
    const inside = (...args: unknown[]): void => {
      const scope = current();
      const text = `${formatWithOptions({ colors: false }, ...args)}\n`;
      if (!scope || !deliver(scope, stream, text)) {
        Reflect.apply(outside, target, args);
      }
    };
    // An accessor, so a later replacement of the method does not come
    // between a command and its caller.
    Object.defineProperty(target, method, {
      configurable: true,
      enumerable: true,
      get: () => (current() ? inside : outside),
      set: (next: (...args: unknown[]) => void) => {
        if (next !== inside) outside = next;
      },
    });
  }
}

let installed = false;

/** Puts the routing in place, once per process. Nothing changes for output
 * written outside a command. */
function install(): void {
  if (installed) return;
  installed = true;
  patchStream("stdout");
  patchStream("stderr");
  patchConsole();
}

/**
 * Runs `work` with what it writes straight to the process sent to `sink`
 * until it settles. Resolves and rejects as `work` does.
 */
export function captureOutput<T>(
  sink: OutputSink,
  work: () => Promise<T>,
): Promise<T> {
  install();
  const scope: Scope = { sink, open: true, decoders: {} };
  const close = () => {
    for (const name of ["stdout", "stderr"] as const) {
      const rest = scope.decoders[name]?.end();
      if (rest) deliver(scope, name, rest);
    }
    scope.open = false;
  };
  let running: Promise<T>;
  try {
    running = scopes.run(scope, work);
  } catch (error) {
    close();
    return Promise.reject(
      error instanceof Error ? error : new Error(String(error)),
    );
  }
  return running.finally(close);
}

/**
 * Runs `fn` as the instance itself, whatever command called: what it writes
 * goes where the instance writes. For the instance's own reactions to what a
 * command does (its listeners on the event bus).
 */
export function asInstance<T>(fn: () => T): T {
  return scopes.getStore() ? scopes.run(undefined, fn) : fn();
}
