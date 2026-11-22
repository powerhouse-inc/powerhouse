import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  clearRunRecord,
  probeRun,
  readProjectName,
  readRunRecord,
  runRecordKey,
  STOP_ON_STDIN_ENV,
  STOP_STREAM_LIMIT_MS,
  stopStreamOf,
  writeRunRecord,
  type RunnerArgsSchema,
  type RunnerContext,
} from "@powerhousedao/host-core";
import { defineHostSchemas } from "@powerhousedao/host-core/schema";
import { z } from "zod";
import type { Cli, RunOptions, RunReactor } from "../core/types.js";
import {
  attachDefaultReactor,
  resolveRemoteReactorConfig,
} from "../integrations/powerhouse/index.js";
import type { ReactorContext } from "../integrations/powerhouse/types.js";

/**
 * cli-runner (A5): runs a package's `Cli` — its `./cli` export, the
 * `defineCli` result — in the terminal `ph run` was started from. The host's
 * reactor is a REMOTE attach, as mastra-runner's: a lone `remote` backend
 * whose `remote.url` is a drive address on a running switchboard (typically
 * the output token `switchboard.drives.<slug>.url`). The runner hands that
 * reactor to the Cli for the run (`RunOptions.reactor`), so whatever the Cli
 * configured in code, no embedded reactor, switchboard or Connect starts.
 * Everything after `ph run <host> --` (or `ph run <host> run`, or a first word
 * that is no verb: `ph run <host> hello`) is the Cli's argv: a one-shot
 * command, `-i` for its shell, or nothing.
 *
 * In a compound it is the foreground member (A6): it runs in the compound's
 * process with the terminal, after the members next to it, which it sees as
 * service instances; its end ends the stack with its exit code.
 */

export const kind = "reactor";

/** The Cli owns the terminal: it reads stdin itself, and in a compound it is
 * the foreground member. */
export const foreground = true;

/** The verbs this runner exports (`runCli`, `loadCli` and `loadOwnCli` are
 * helpers). */
export const verbs = ["run", "build"] as const;

/** The Cli parses its own arguments: `ph run` hands them over unchecked. */
export const argsSchema: RunnerArgsSchema = {
  options: [],
  flags: [],
  passthrough: true,
};

/** The token a host writes for the switchboard's drive address (error hints). */
const REMOTE_URL_HINT =
  'remote: { url: switchboard.drives.<slug>.url } (from ../switchboard/outputs.js), or literally { url: { $output: { host: "switchboard", path: ["drives", "<slug>", "url"] } } }';

/**
 * The cli host, from one definition in two forms: DECLARED (`remote.url` may
 * be an output token; what host.js authors write) and RESOLVED (what the verb
 * receives). `config` names the Cli; the reactor block names its switchboard.
 */
const schemas = defineHostSchemas((s) =>
  s.reactorHostSchema.extend({
    runner: s.runnerBaseSchema.strict(),
    config: z
      .strictObject({
        /** The package whose `./cli` export the host runs (`<package>/cli`,
         * resolved from the project). Absent: the project's own `./cli`. In a
         * host an installed package supplies, both resolve from that package:
         * absent is the package's own `./cli`. */
        package: z.string().min(1).optional(),
      })
      .optional(),
  }),
);
/** Declared form: what a host file may contain before resolution. */
export const declaredHostSchema = schemas.declaredHostSchema;
/** Resolved form: what the verb receives (and `validateHost` checks). */
export const hostSchema = schemas.hostSchema;

/** What a cli host.js author writes. */
export type CliHostInput = z.input<typeof declaredHostSchema>;
/** What the verb receives. */
export type CliHost = z.output<typeof hostSchema>;

declare global {
  interface PHHostRunners {
    "@powerhousedao/clint/cli-runner": {
      host: CliHostInput;
      outputs: Record<string, never>;
    };
  }
}

/** The drive address the host's reactor attaches to; undefined without a
 * reactor block (the Cli then keeps the reactor it configured, if any). */
function remoteUrlOf(host: CliHost): string | undefined {
  const backends = Object.entries(host.reactor?.backends ?? {});
  if (backends.length === 0) return undefined;
  const local = backends.find(([, backend]) => backend.kind !== "remote");
  if (local) {
    throw new Error(
      `hosts/${host.name}: a cli host attaches to a RUNNING switchboard, but backend "${local[0]}" is "${local[1].kind}". ` +
        `Run the reactor as its own switchboard host and declare one remote backend: ${REMOTE_URL_HINT}.`,
    );
  }
  if (backends.length > 1) {
    throw new Error(
      `hosts/${host.name}: a cli host attaches to one switchboard; declare one remote backend, not ${backends.length}.`,
    );
  }
  const url = backends[0][1].remote?.url;
  if (typeof url !== "string") {
    throw new Error(
      `hosts/${host.name}: the remote backend needs a drive address on the switchboard (<switchboard>/d/<slug>): ${REMOTE_URL_HINT}.`,
    );
  }
  return url;
}

function isCli(value: unknown): value is Cli {
  if (typeof value !== "object" || value === null) return false;
  const cli = value as Partial<Record<keyof Cli, unknown>>;
  return (
    typeof cli.name === "string" &&
    typeof cli.run === "function" &&
    typeof cli.listCommands === "function"
  );
}

/** The project's own package name, which its `./cli` is reached by. */
function ownPackageName(projectRoot: string): string {
  let name: unknown;
  try {
    name = (
      JSON.parse(
        fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
      ) as { name?: unknown }
    ).name;
  } catch {
    // reported below
  }
  if (typeof name !== "string" || !name) {
    throw new Error(
      `${projectRoot}/package.json has no name, so its ./cli export cannot be resolved; set config.package to the package that exports the Cli.`,
    );
  }
  return name;
}

/**
 * The `Cli` a package exports as `./cli` (named `cli`, or the default
 * export), resolved from the project's dependency tree. Without `packageName`
 * it is the project's own export, by its package.json name.
 */
export async function loadCli(
  projectRoot: string,
  packageName?: string,
): Promise<Cli> {
  const specifier = `${packageName ?? ownPackageName(projectRoot)}/cli`;
  const projectRequire = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  let file: string;
  try {
    file = projectRequire.resolve(specifier);
  } catch (cause) {
    throw new Error(
      packageName
        ? `Cannot resolve ${specifier} from ${projectRoot}: the package must be a dependency of the project and export ./cli.`
        : `Cannot resolve ${specifier} from ${projectRoot}: its package.json needs the ./cli export, and \`ph build\` must have built cli/index.ts.`,
      { cause },
    );
  }
  const module = (await import(pathToFileURL(file).href)) as Record<
    string,
    unknown
  >;
  const cli = module.cli ?? module.default;
  if (!isCli(cli)) {
    throw new Error(
      `${specifier} exports no Cli: export the defineCli result as \`cli\` (or as the default export).`,
    );
  }
  return cli;
}

/**
 * The project's own `./cli` export, or undefined when its package.json has
 * none (a package without a Cli). An export that is declared but cannot be
 * loaded throws, as `loadCli` does.
 */
export async function loadOwnCli(
  projectRoot: string,
): Promise<Cli | undefined> {
  let exported: unknown;
  try {
    exported = (
      JSON.parse(
        fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"),
      ) as { exports?: Record<string, unknown> }
    ).exports?.["./cli"];
  } catch {
    return undefined;
  }
  return exported ? loadCli(projectRoot) : undefined;
}

/** Whether `argv` opens the Cli's shell: `-i` before the command name, as the
 * Cli itself reads its framework flags. */
function asksInteractive(cli: Cli, argv: readonly string[]): boolean {
  const commands = new Set([...cli.listCommands().map(({ id }) => id), "help"]);
  for (const arg of argv) {
    if (commands.has(arg)) return false;
    if (arg === "-i" || arg === "--interactive") return true;
  }
  return false;
}

/** Calls `stop` once, when `stream` delivers anything or ends. */
function whenStreamStops(stream: NodeJS.ReadableStream, stop: () => void) {
  let stopped = false;
  const once = () => {
    if (stopped) return;
    stopped = true;
    stop();
  };
  for (const event of ["data", "end", "close", "error"]) {
    stream.once(event, once);
  }
  stream.resume();
}

export interface RunCliOptions {
  /** The Cli's arguments, as typed after its name. */
  argv: readonly string[];
  /** A switchboard drive address (`<switchboard>/d/<slug>`) the Cli's
   * reactor attaches to, in place of the one it configured. Absent: the Cli
   * keeps its own. */
  url?: string;
  /** Where the Cli works when no `--workdir` says otherwise. Default: cwd. */
  workdir?: string;
  /** A supervisor's stop request: anything on it, or its end, stops the Cli
   * as SIGTERM would. It is stdin, so the Cli's shell (`-i`) is refused. */
  stopStream?: NodeJS.ReadableStream;
  /** How long a stop may take before the process exits regardless (default
   * {@link STOP_STREAM_LIMIT_MS}). */
  stopStreamLimitMs?: number;
  /** Called when the Cli keeps running (see `RunOptions.onServe`). */
  onServe?: () => void | Promise<void>;
  /** Stops a Cli that keeps running (see `RunOptions.signal`). */
  signal?: AbortSignal;
  /** The compound's other members (see `RunOptions.members`). */
  members?: RunOptions["members"];
}

/**
 * Runs `cli` in this process's terminal: its stdin, stdout and stderr, and
 * the reactor `url` names. Resolves with the exit code once the Cli is done
 * and its reactor released; it never exits the process itself, except when a
 * stop through `stopStream` outlives its limit. A product bin is this call:
 * `process.exit(await runCli(cli, { url, argv: process.argv.slice(2) }))`.
 */
export async function runCli(
  cli: Cli,
  options: RunCliOptions,
): Promise<number> {
  const { stopStream } = options;
  if (stopStream && asksInteractive(cli, options.argv)) {
    console.error(
      `${cli.name}: -i reads stdin, and the process that started this one holds stdin to ask it to stop (${STOP_ON_STDIN_ENV}=1). ` +
        "Run the shell from a terminal, or run a command without -i.",
    );
    return 1;
  }

  // Released here as well as by the Cli's teardown, which not every exit
  // path of the Cli runs; it releases once.
  let attached: ReactorContext | undefined;
  const { url } = options;
  const reactor: RunReactor | undefined = url
    ? async (setup, configured) =>
        (attached = await attachDefaultReactor(setup, {
          ...(await resolveRemoteReactorConfig(configured?.remote, setup)),
          url,
        }))
    : undefined;

  if (stopStream) {
    whenStreamStops(stopStream, () => {
      // No supervisor may be left to end a stop that hangs.
      const limit = options.stopStreamLimitMs ?? STOP_STREAM_LIMIT_MS;
      setTimeout(() => process.exit(143), limit).unref();
      // As the stop channel does: a serving Cli's handler tears it down. A
      // stop during its start waits for the handler; a command in flight
      // finishes within the limit.
      if (process.emit("SIGTERM", "SIGTERM")) return;
      const retry = setInterval(() => {
        if (process.emit("SIGTERM", "SIGTERM")) clearInterval(retry);
      }, 100);
      retry.unref();
    });
    // These go when the supervisor does, and with no listener the next line
    // would be a fatal error in the middle of the shutdown it asked for.
    for (const output of [process.stdout, process.stderr]) {
      output.on("error", () => undefined);
    }
  }

  let exitCode = 0;
  try {
    await cli.run(["node", cli.name, ...options.argv], {
      exit: (code) => {
        exitCode = code;
      },
      ...(options.workdir ? { workdir: options.workdir } : {}),
      ...(reactor ? { reactor } : {}),
      ...(options.onServe ? { onServe: options.onServe } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      ...(options.members ? { members: options.members } : {}),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    if (exitCode === 0) exitCode = 1;
  } finally {
    await attached?.shutdown();
  }
  return exitCode;
}

/**
 * The record of a Cli that keeps running: what `ph run <host> --stop` reads.
 * A one-shot writes none and takes no lock, so it runs beside a serving
 * instance; a second serving instance is refused.
 */
function recordServing(
  projectRoot: string,
  hostName: string,
  verb: string,
  hostPackage?: string,
): void {
  const projectName = readProjectName(projectRoot);
  // A package's host is filed, and addressed, behind its package.
  const key = runRecordKey(hostName, hostPackage);
  const probe = probeRun(projectRoot, key, projectName);
  if (probe.status === "live" && probe.record.pid !== process.pid) {
    throw new Error(
      `${key} is already running for this project (pid ${probe.record.pid}). ` +
        `Stop it with \`ph run ${key} --stop\`, or run a command beside it: \`ph run ${key} -- <command>\`.`,
    );
  }
  if (probe.status === "foreign") {
    throw new Error(
      `.ph/run/${key}.json describes a live "${probe.record.projectName}", but this project is "${projectName}". Refusing to start a second instance.`,
    );
  }
  writeRunRecord(projectRoot, {
    version: 2,
    host: hostName,
    ...(hostPackage === undefined ? {} : { package: hostPackage }),
    projectName,
    kind: "reactor",
    verb,
    pid: process.pid,
    startedAt: new Date().toISOString(),
    outputs: {},
  });
  process.on("exit", () => {
    if (readRunRecord(projectRoot, key)?.pid === process.pid) {
      clearRunRecord(projectRoot, key);
    }
  });
}

/** Resolves once what was written to `stream` before has been handed on
 * (process.exit drops what a pipe has not taken yet). */
function drained(stream: NodeJS.WriteStream): Promise<void> {
  return new Promise((resolve) => stream.write("", () => resolve()));
}

/** How long a stop from the compound waits for the Cli before the compound
 * stops the rest: a command in flight or the line-based shell does not
 * listen for it. */
const FOREGROUND_STOP_MS = 10_000;

/** The handle the compound gets from its foreground member. */
export interface ForegroundHandle {
  outputs: Record<string, never>;
  ready: Promise<void>;
  /** The Cli's end, with its exit code: the stack's. */
  exited: Promise<number>;
  /** Asks the Cli to stop (its `RunOptions.signal`) and waits for it, up to
   * a limit. */
  shutdown(): Promise<void>;
}

/**
 * The Cli as a compound's foreground member: in the compound's process, on
 * the terminal, after the other members. Returns at once; the compound reads
 * the Cli's end from `exited`. A supervised compound holds stdin (its stop
 * stream), so the Cli neither reads it nor opens its shell then. Beside a
 * running stack it may only run a command that ends.
 */
function inStack(
  cli: Cli,
  host: CliHost,
  ctx: RunnerContext & { foreground: NonNullable<RunnerContext["foreground"]> },
  url: string | undefined,
): ForegroundHandle {
  const argv = ctx.argv ?? [];
  const stack = ctx.parent?.host ?? host.name;
  const done = (exited: Promise<number>): ForegroundHandle => ({
    outputs: {},
    ready: Promise.resolve(),
    exited,
    shutdown: () => Promise.resolve(),
  });
  if (ctx.env[STOP_ON_STDIN_ENV] === "1" && asksInteractive(cli, argv)) {
    console.error(
      `${cli.name}: -i reads stdin, and the process that started "${stack}" holds its stdin to ask it to stop (${STOP_ON_STDIN_ENV}=1). ` +
        `Run the shell from a terminal, or run a command without -i.`,
    );
    return done(Promise.resolve(1));
  }
  const stop = new AbortController();
  const exited = runCli(cli, {
    argv,
    ...(url ? { url } : {}),
    workdir: ctx.projectRoot,
    signal: stop.signal,
    members: ctx.foreground.members,
    ...(ctx.foreground.beside
      ? {
          onServe: () => {
            throw new Error(
              `${stack} is already running: beside it, \`ph run ${stack} -- <command>\` runs a command that ends. The shell and a serving Cli run in the stack itself.`,
            );
          },
        }
      : {}),
  }).then(async (code) => {
    await Promise.all([drained(process.stdout), drained(process.stderr)]);
    return code;
  });
  return {
    ...done(exited),
    shutdown: async () => {
      stop.abort();
      let timer: NodeJS.Timeout | undefined;
      await Promise.race([
        exited,
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, FOREGROUND_STOP_MS);
        }),
      ]);
      clearTimeout(timer);
    },
  };
}

/**
 * `run`: the Cli in the foreground, with the host's reactor. On its own the
 * process ends with the Cli's exit code. As a compound's foreground member
 * it returns a handle whose `exited` the compound ends the stack on; it is
 * never a compound's other, in-process kind of member.
 */
export async function run(
  host: CliHost,
  ctx: RunnerContext,
): Promise<ForegroundHandle | undefined> {
  if (ctx.parent && !ctx.foreground) {
    throw new Error(
      `hosts/${host.name}: compound "${ctx.parent.host}" runs the cli runner as an ordinary member, but the Cli owns the terminal and its end is the stack's: it runs on its own (\`ph run ${host.name}\`) or as a compound's foreground member.`,
    );
  }
  const url = remoteUrlOf(host);
  // From the package that supplies the host, if one does: its own `./cli`.
  // The Cli still works in the project.
  const cli = await loadCli(
    ctx.hostPackage?.root ?? ctx.projectRoot,
    host.config?.package,
  );
  if (ctx.foreground) {
    return inStack(cli, host, { ...ctx, foreground: ctx.foreground }, url);
  }
  const stopStream = stopStreamOf(ctx.env, () => process.stdin);
  const code = await runCli(cli, {
    argv: ctx.argv ?? [],
    ...(url ? { url } : {}),
    workdir: ctx.projectRoot,
    ...(stopStream ? { stopStream } : {}),
    onServe: () =>
      recordServing(
        ctx.projectRoot,
        host.name,
        ctx.verb,
        ctx.hostPackage?.name,
      ),
  });
  await Promise.all([drained(process.stdout), drained(process.stderr)]);
  process.exit(code);
}

/**
 * `build`: the package's skill and agent-profile compilation with the Cli's
 * metadata in the template context. Loading the Cli starts nothing (no
 * reactor, no services). Source and output are the conventional paths
 * (`prompts/` or `agents/`, `dist/skills`). Shadows a Cli command named
 * `build` as the first word after the host; `ph run <host> run build` still
 * reaches it.
 */
export async function build(host: CliHost, ctx: RunnerContext): Promise<void> {
  const cli = await loadCli(ctx.projectRoot, host.config?.package);
  const { buildSkills } = await import("../dev/build-skills.js");
  const result = await buildSkills({ rootDir: ctx.projectRoot, cli });
  console.log(
    `[${host.name}] compiled ${result.skills} skill(s), ${result.profiles} profile(s) → ${result.outDir}`,
  );
}
