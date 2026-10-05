// What PieceWorker needs from a connection to a worker, and nothing else.

// Written against this rather than a ChildProcess so a later transport — a
// pooled fork, a socket to another machine — slots in underneath unchanged.
import { fork, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface TransportExit {
  code: number | null;
  signal: NodeJS.Signals | null;
}

export type TransportEventMap = {
  message: unknown;
  exit: TransportExit;
};

export type TransportEvent = keyof TransportEventMap;

export type TransportListener<E extends TransportEvent> = (
  payload: TransportEventMap[E],
) => void;

// One worker's connection. An implementation must deliver `message` payloads
// faithfully enough for the protocol above, and emit `exit` exactly once.

// "Faithfully enough" means JSON-shaped, deliberately: the fork's structured
// clone would carry a Date or a Map, but nothing may depend on that, because
// no other carrier could honour it.

// PieceWorker flattens what it sends and the child flattens what it answers,
// so this is a contract a socket could meet too — a transport is not required
// to preserve anything JSON would lose.
export interface IPieceWorkerTransport {
  send(message: unknown): void;
  on<E extends TransportEvent>(event: E, listener: TransportListener<E>): void;
  off<E extends TransportEvent>(event: E, listener: TransportListener<E>): void;
  // Ends the worker now; it takes any pending host calls with it.
  kill(): void;
  // False once the worker cannot receive: a send after this is dropped.
  readonly connected: boolean;
}

// Builds a fresh connection. Called on first use and again after a worker is
// killed, so a factory must be able to produce more than one.
export type PieceWorkerTransportFactory = () => IPieceWorkerTransport;

export function defaultEntryPath(): string {
  let dir = path.dirname(fileURLToPath(import.meta.url));
  while (!existsSync(path.join(dir, "package.json"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("Could not locate package root");
    dir = parent;
  }
  const entry = path.join(dir, "dist", "worker-entry.js");
  if (!existsSync(entry)) {
    throw new Error(`Worker entry not built at ${entry} — run pnpm build`);
  }
  return entry;
}

// A forked node child on this machine, over its IPC channel.
export function createForkTransport(entryPath: string): IPieceWorkerTransport {
  const child: ChildProcess = fork(entryPath, [], {
    // Empty env: the child gets no host secrets and no inherited TLS overrides.
    env: {},
    execArgv: [],
    // Structured clone rather than JSON, so a Buffer in a payload survives.
    serialization: "advanced",
    // Piece stdout/stderr are dropped for now; log capture arrives with journaling.
    stdio: ["ignore", "ignore", "ignore", "ipc"],
  });

  // Node reports exit as two positional arguments; the interface carries one
  // payload, so the adaptation lives here rather than in every listener.
  const exitListeners = new Map<
    TransportListener<"exit">,
    (code: number | null, signal: NodeJS.Signals | null) => void
  >();

  return {
    get connected() {
      return child.connected;
    },
    send(message) {
      child.send(message as never);
    },
    on(event, listener) {
      if (event === "exit") {
        const adapted = (code: number | null, signal: NodeJS.Signals | null) =>
          (listener as TransportListener<"exit">)({ code, signal });
        exitListeners.set(listener as TransportListener<"exit">, adapted);
        child.on("exit", adapted);
        return;
      }
      child.on("message", listener as (value: unknown) => void);
    },
    off(event, listener) {
      if (event === "exit") {
        const adapted = exitListeners.get(
          listener as TransportListener<"exit">,
        );
        if (adapted) {
          child.off("exit", adapted);
          exitListeners.delete(listener as TransportListener<"exit">);
        }
        return;
      }
      child.off("message", listener as (value: unknown) => void);
    },
    kill() {
      child.kill("SIGKILL");
    },
  };
}
