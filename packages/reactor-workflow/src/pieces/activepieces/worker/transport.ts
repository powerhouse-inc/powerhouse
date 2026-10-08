// What PieceWorker needs from a connection to a worker, and nothing else.

// Written against this rather than a ChildProcess so a later transport — a
// pooled fork, a socket to another machine — slots in underneath unchanged.
import { fork, type ChildProcess } from "node:child_process";
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdirSync,
} from "node:fs";
import { tmpdir, userInfo } from "node:os";
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

// How long a profiling child gets to write its profile before SIGKILL.
const PROFILE_EXIT_MS = 2_000;

// Each child writes a V8 CPU profile here; for benchmarks.
function workerProfileDir(): string | undefined {
  return process.env.PH_WORKFLOWS_WORKER_CPU_PROF_DIR || undefined;
}

let compileCache: string | null | undefined;

// A planted cache is code the child runs, so the directory must be ours alone:
// mkdirSync leaves an existing one, whoever owns it, as it found it.
export function privateDirectory(dir: string): boolean {
  const stat = lstatSync(dir);
  if (!stat.isDirectory()) return false;
  // No uids on Windows; there the directory sits in the user's own temp.
  if (typeof process.getuid !== "function") return true;
  return stat.uid === process.getuid() && (stat.mode & 0o077) === 0;
}

// Children run piece code as our uid and can write the cache, so by default it
// is used only where they could already rewrite the entry it caches.
export function writable(file: string): boolean {
  try {
    accessSync(file, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

// V8 code cache every child shares, so a fork skips compiling what an earlier
// one did. PH_WORKFLOWS_WORKER_COMPILE_CACHE names the directory; "off" disables.
function workerCompileCache(entryPath: string): string | undefined {
  if (compileCache === undefined) {
    const configured = process.env.PH_WORKFLOWS_WORKER_COMPILE_CACHE;
    try {
      if (configured === "off") throw new Error("disabled");
      if (!configured && !writable(entryPath)) throw new Error("read-only");
      // userInfo throws in a container whose uid has no passwd entry.
      const base = configured
        ? undefined
        : path.join(tmpdir(), `ph-workflows-${userInfo().uid}`);
      const dir = configured || path.join(base!, "compile-cache");
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      // In a shared tmp the parent counts too: its owner could swap the cache out.
      const owned = privateDirectory(dir) && (!base || privateDirectory(base));
      compileCache = owned ? dir : null;
    } catch {
      // Unwritable or disabled: children compile from source.
      compileCache = null;
    }
  }
  return compileCache ?? undefined;
}

// A forked node child on this machine, over its IPC channel.
export function createForkTransport(entryPath: string): IPieceWorkerTransport {
  const profileDir = workerProfileDir();
  const cacheDir = workerCompileCache(entryPath);
  const child: ChildProcess = fork(entryPath, [], {
    // No host env: the child gets no secrets and no inherited TLS overrides.
    env: cacheDir ? { NODE_COMPILE_CACHE: cacheDir } : {},
    execArgv: profileDir ? ["--cpu-prof", `--cpu-prof-dir=${profileDir}`] : [],
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
      if (!profileDir) {
        child.kill("SIGKILL");
        return;
      }
      // SIGTERM lets it write its CPU profile; a blocked loop never handles it.
      child.kill("SIGTERM");
      const force = setTimeout(() => child.kill("SIGKILL"), PROFILE_EXIT_MS);
      force.unref();
      child.once("exit", () => clearTimeout(force));
    },
  };
}
