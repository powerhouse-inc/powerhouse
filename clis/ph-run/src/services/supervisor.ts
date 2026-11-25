import {
  installStopChannel,
  STOP_ON_STDIN_ENV,
  supervisedFactLines,
} from "@powerhousedao/host-core";
import {
  findSupervisor,
  holdSupervisorLease,
  listSupervised,
  restartSupervised,
  shutdownSupervisor,
  silentSupervisorMessage,
  startSupervised,
  startSupervisor,
  stopSupervised,
  supervisedLogs,
  supervisorRecordPath,
  type InstanceLifetime,
  type SupervisedInstance,
  type SupervisorRecord,
} from "@powerhousedao/host-core/supervisor";
import { createRequire } from "node:module";
import path from "node:path";

/**
 * `ph run supervisor`: the supervisor of this OS user, in the foreground,
 * and the commands that ask it. It is no host: nothing of a project is
 * loaded, and the name is taken before a project's hosts are read.
 *
 *   ph run supervisor                      run it here until Ctrl-C
 *   ph run supervisor --stop               stop it, and what it holds
 *   ph run supervisor ps                   what it holds
 *   ph run supervisor start <host> [verb] [--lifetime caller|supervisor]
 *       [--project <dir>] [--data <dir>] [--record optional]
 *       [--ready-timeout <ms>] [--restart <times> [--restart-delay <ms>]]
 *       [runner arguments]
 *   ph run supervisor stop|restart <handle>
 *   ph run supervisor logs <handle> [--lines <n>]
 */

/** The host name `ph run` gives to the supervisor. */
export const SUPERVISOR_HOST = "supervisor";

export const SUPERVISOR_USAGE =
  "Usage: ph run supervisor [--stop | ps | start <host> [verb] [--lifetime caller|supervisor] " +
  "[--project <dir>] [--data <dir>] [--restart <times> [--restart-delay <ms>]] [runner arguments] | " +
  "stop <handle> | restart <handle> | logs <handle>]";

export interface SupervisorCommand {
  verb?: string;
  /** What follows the verb. */
  argv: readonly string[];
  /** `--stop`. */
  stop?: boolean;
  env?: NodeJS.ProcessEnv;
  print?: (line: string) => void;
}

function packageVersion(): string {
  try {
    const pkg = createRequire(import.meta.url)("../../package.json") as {
      version?: string;
    };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** One instance, as `ps` prints it. */
export function describeSupervised(instance: SupervisedInstance): string[] {
  const ports = Object.entries(instance.ports ?? {})
    .map(([name, port]) => `${name}:${port}`)
    .join(" ");
  const head = [
    instance.handle.padEnd(3),
    instance.status.padEnd(10),
    `pid ${instance.pid}`.padEnd(10),
    instance.mine ? `with the ${instance.lifetime}` : "not mine",
    instance.verb ? `${instance.host} ${instance.verb}` : instance.host,
  ].join("  ");
  return [
    head,
    `     data folder: ${instance.dataDir}${instance.projectDir === instance.dataDir ? "" : ` (project ${instance.projectDir})`}`,
    ...(ports ? [`     ports: ${ports}`] : []),
    ...supervisedFactLines(instance).map((line) => `     ${line}`),
  ];
}

const FLAGS_WITH_VALUE = new Set([
  "--lifetime",
  "--project",
  "--data",
  "--record",
  "--ready-timeout",
  "--restart",
  "--restart-delay",
  "--lines",
]);

/** The supervisor's own flags out of `argv`; the rest stays in order. */
function takeFlags(argv: readonly string[]): {
  flags: Record<string, string>;
  rest: string[];
} {
  const flags: Record<string, string> = {};
  const rest: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    const equals = arg.indexOf("=");
    const name = equals === -1 ? arg : arg.slice(0, equals);
    if (!FLAGS_WITH_VALUE.has(name)) {
      rest.push(arg);
      continue;
    }
    const value = equals === -1 ? argv[++i] : arg.slice(equals + 1);
    if (value === undefined) throw new Error(`${name} needs a value.`);
    flags[name] = value;
  }
  return { flags, rest };
}

async function running(env: NodeJS.ProcessEnv): Promise<SupervisorRecord> {
  const found = await findSupervisor(env);
  if (found.status === "running") return found.record;
  if (found.status === "silent") {
    throw new Error(silentSupervisorMessage(found, env));
  }
  throw new Error(
    "No supervisor runs for this user. Start one with `ph run supervisor`.",
  );
}

async function foreground(
  env: NodeJS.ProcessEnv,
  print: (line: string) => void,
): Promise<number> {
  const started = await startSupervisor({
    env,
    version: packageVersion(),
    log: print,
  });
  if ("existing" in started) {
    const { existing } = started;
    if (existing.status === "silent") {
      print(silentSupervisorMessage(existing, env));
      return 1;
    }
    print(
      `A supervisor already runs for this user (pid ${existing.record.pid}, since ${existing.record.startedAt}). Nothing was started. \`ph run supervisor ps\` lists what it holds.`,
    );
    return 0;
  }
  const { supervisor } = started;
  print(
    `Supervisor running (pid ${process.pid}, ${supervisor.record.mode}). It holds no application: tools of this user start instances through it.`,
  );
  print(`  record: ${supervisorRecordPath(env)}`);
  print(
    `  channel: ${supervisor.ownerOnly ? "open to this user only" : "kept by its token (the system's access list could not be narrowed)"}`,
  );
  print("  Ctrl-C stops it and everything it holds.");

  const stop = () => void supervisor.stop();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  // `requestStop` reaches the SIGTERM handler on Windows too.
  installStopChannel();
  if (env[STOP_ON_STDIN_ENV] === "1") {
    process.stdin.on("end", stop).on("close", stop).on("error", stop);
    process.stdin.resume();
  }
  // Its channel does not keep the process running; this does.
  const keepAlive = setInterval(() => undefined, 60_000);
  await supervisor.stopped;
  clearInterval(keepAlive);
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
  if (env[STOP_ON_STDIN_ENV] === "1") process.stdin.pause();
  print("Supervisor stopped.");
  return 0;
}

async function start(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  print: (line: string) => void,
): Promise<number> {
  const { flags, rest } = takeFlags(argv);
  const host = rest[0];
  if (!host || host.startsWith("-")) throw new Error(SUPERVISOR_USAGE);
  const verb =
    rest[1] !== undefined && !rest[1].startsWith("-") ? rest[1] : undefined;
  const runnerArgv = rest.slice(verb === undefined ? 1 : 2);
  const lifetime = (flags["--lifetime"] ?? "caller") as InstanceLifetime;
  if (lifetime !== "caller" && lifetime !== "supervisor") {
    throw new Error("--lifetime is `caller` (the default) or `supervisor`.");
  }
  const record = flags["--record"];
  if (record !== undefined && record !== "optional" && record !== "required") {
    throw new Error("--record is `required` (the default) or `optional`.");
  }
  const readyTimeoutMs =
    flags["--ready-timeout"] === undefined
      ? undefined
      : Number(flags["--ready-timeout"]);
  if (readyTimeoutMs !== undefined && !(readyTimeoutMs > 0)) {
    throw new Error("--ready-timeout is a number of milliseconds.");
  }
  // The supervisor restarts one that ends on its own, this many times in a
  // row at most.
  const maxRetries =
    flags["--restart"] === undefined ? undefined : Number(flags["--restart"]);
  if (
    maxRetries !== undefined &&
    !(Number.isInteger(maxRetries) && maxRetries >= 0)
  ) {
    throw new Error("--restart is a number of restarts in a row.");
  }
  const restartDelay = Number(flags["--restart-delay"] ?? 1_000);
  if (!(restartDelay >= 0)) {
    throw new Error("--restart-delay is a number of milliseconds.");
  }
  if (flags["--restart-delay"] !== undefined && maxRetries === undefined) {
    throw new Error("--restart-delay goes with --restart <times>.");
  }
  const projectDir = path.resolve(flags["--project"] ?? process.cwd());
  const { control } = await running(env);

  // The instance starts from this terminal's environment, as it would here.
  const baseEnv: Record<string, string> = {};
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && key !== STOP_ON_STDIN_ENV) baseEnv[key] = value;
  }
  const lease =
    lifetime === "caller" ? await holdSupervisorLease(control) : undefined;
  const abort = new AbortController();
  const interrupt = () => abort.abort();
  process.once("SIGINT", interrupt);
  const { instance, started } = await startSupervised(
    control,
    {
      host,
      projectDir,
      ...(flags["--data"] === undefined
        ? {}
        : { dataDir: path.resolve(flags["--data"]) }),
      ...(verb === undefined ? {} : { verb }),
      ...(runnerArgv.length > 0 ? { argv: runnerArgv } : {}),
      baseEnv,
      lifetime,
      ...(lease ? { lease: lease.id } : {}),
      ...(readyTimeoutMs === undefined ? {} : { readyTimeoutMs }),
      ...(record === undefined ? {} : { record }),
      ...(maxRetries === undefined
        ? {}
        : { restart: { enabled: true, maxRetries, delay: restartDelay } }),
    },
    { signal: abort.signal },
  ).finally(() => process.off("SIGINT", interrupt));

  print(
    started
      ? `Started under the supervisor, with the ${lifetime}:`
      : "It runs already; nothing was started:",
  );
  for (const line of describeSupervised(instance)) print(line);
  if (!started || !lease) {
    await lease?.release();
    return 0;
  }

  // With the caller: this command is the caller, until it ends.
  print("It stops when this command ends (Ctrl-C).");
  await new Promise<void>((resolve) => {
    const done = () => {
      clearInterval(timer);
      process.off("SIGINT", done);
      process.off("SIGTERM", done);
      resolve();
    };
    // Until it has ended for good: the supervisor may start it again.
    let asking = false;
    const timer = setInterval(() => {
      if (asking) return;
      asking = true;
      void listSupervised(control)
        .then(
          (listed) => {
            const now = listed.instances.find(
              (i) => i.mine && i.handle === instance.handle,
            );
            if (!now || now.status === "exited" || now.status === "failed") {
              done();
            }
          },
          () => done(),
        )
        .finally(() => (asking = false));
    }, 500);
    process.once("SIGINT", done);
    process.once("SIGTERM", done);
    void lease.ended.then(done);
  });
  await lease.release();
  print(`${host} stopped.`);
  return 0;
}

/** Runs one `ph run supervisor …` command; resolves with its exit code. */
export async function runSupervisorCommand(
  command: SupervisorCommand,
): Promise<number> {
  const env = command.env ?? process.env;
  const print = command.print ?? ((line: string) => console.log(line));
  const { verb, argv } = command;

  if (command.stop) {
    const found = await findSupervisor(env);
    if (found.status === "none") {
      print("No supervisor runs for this user.");
      return 0;
    }
    if (found.status === "silent") {
      print(silentSupervisorMessage(found, env));
      return 1;
    }
    const { pid, held } = await shutdownSupervisor(found.record.control);
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      if ((await findSupervisor(env)).status === "none") break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    print(
      `Supervisor (pid ${pid}) stopped, with the ${held} instance(s) it held.`,
    );
    return 0;
  }

  switch (verb) {
    case undefined:
    case "run":
      return foreground(env, print);
    case "ps":
    case "list": {
      const { flags } = takeFlags(argv);
      const { control } = await running(env);
      const listed = await listSupervised(
        control,
        flags["--data"] ?? flags["--project"],
      );
      print(
        `Supervisor pid ${listed.supervisor.pid} (${listed.supervisor.mode}, ${listed.supervisor.version})`,
      );
      if (listed.instances.length === 0) print("It holds no instance.");
      for (const instance of listed.instances) {
        for (const line of describeSupervised(instance)) print(line);
      }
      return 0;
    }
    case "start":
      return start(argv, env, print);
    case "stop":
    case "restart": {
      const handle = argv[0];
      if (!handle) throw new Error(SUPERVISOR_USAGE);
      const { control } = await running(env);
      const instance =
        verb === "stop"
          ? await stopSupervised(control, handle)
          : await restartSupervised(control, handle);
      for (const line of describeSupervised(instance)) print(line);
      return 0;
    }
    case "logs": {
      const { flags, rest } = takeFlags(argv);
      const handle = rest[0];
      if (!handle) throw new Error(SUPERVISOR_USAGE);
      const { control } = await running(env);
      const lines =
        flags["--lines"] === undefined ? undefined : Number(flags["--lines"]);
      const { text, logFile } = await supervisedLogs(control, handle, lines);
      print(text);
      print(`(${logFile})`);
      return 0;
    }
    default:
      throw new Error(
        `Unknown supervisor command "${verb}". ${SUPERVISOR_USAGE}`,
      );
  }
}
