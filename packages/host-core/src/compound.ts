import { resolvePhDir } from "@powerhousedao/shared/clis/ph-dir";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import {
  declaredGenericCompoundHostSchema,
  type ChildWrapper,
  type CompoundWiring,
  type HostDefinition,
  type MemberProcess,
  type RunnerKind,
} from "./host-schemas.js";
import { applyChildWrapper, type MemberDraft } from "./child-wrapper.js";
import { substituteBuiltinEnv } from "./env-substitution.js";
import { loadHost, moduleRootOf } from "./host-loader.js";
import { hostFileLabel, type HostPackage } from "./host-ref.js";
import { defaultUserDataDir } from "./placeholders.js";
import { declaresKey, outputSitesOf } from "./resolve/declared.js";
import { processResolveEnv, runnerOutputsSchema } from "./resolve/node.js";
import {
  memberForRef,
  planCompound,
  type CompoundPlan,
} from "./resolve/plan.js";
import { findRemovedForms } from "./resolve/removed-forms.js";
import { isPlainObject } from "./resolve/walk.js";
import { emptyMaps, resolveHostOutputs } from "./resolve/resolve.js";
import { compoundOutputSource } from "./resolve/sources.js";
import {
  clearRunRecord,
  probeRun,
  runRecordKey,
  writeRunRecord,
  type RunRecordMember,
} from "./run-record.js";
import { splitCompoundArgv } from "./runner-args.js";
import { toStartedHandle, type StartedHandle } from "./runner-handle.js";
import {
  CONNECT_RUNNER,
  getVerb,
  isSchemaLike,
  ONE_SHOT_VERBS,
  resolveRunnerModule,
  RunnerError,
  validateDeclaredHost,
  validateHost,
  type MemberStatus,
  type RunnerContext,
  type RunnerIssue,
  type RunnerModule,
} from "./runner-resolver.js";
import { spawnHost } from "./spawn-host.js";
import { STOP_ON_STDIN_ENV } from "./stop-channel.js";

export type { MemberDraft } from "./child-wrapper.js";
export type { ChildWrapper, CompoundWiring } from "./host-schemas.js";
export type { RunnerHandle, StartedHandle } from "./runner-handle.js";

/**
 * The generic compound runner: supervises the members a compound host
 * declares, each started via its OWN declared runner at its own effective
 * verb, writes a v2 .ph/run/<host>.json record, holds a per-project lock
 * (neither at a one-shot verb such as build, which starts nothing), and
 * tears members down in reverse order through their `shutdown()`.
 *
 * Members consume each other's outputs through `$output` tokens: the
 * dependency plan (resolve/plan.ts) orders the start, each member's tokens
 * resolve against the live outputs of the members started before it, and
 * the member's runner validates the resolved host.
 *
 * Attached, and in-process unless a member runs in its own process: member
 * verbs start their servers (which hold the event loop) and return a
 * handle; the compound lives as long as they do. An own-process member is
 * `ph run <host>` as a child (spawnHost), handed its resolved host, stopped
 * through its stdin. A foreground member (a runner that exports
 * `foreground: true`, the Cli runner) owns the terminal: it starts last, in
 * this process, and its end ends the stack with its exit code; the members
 * next to it run in their own processes unless they say otherwise.
 *
 * A compound an installed package supplies (`ctx.hostPackage`) names its
 * members in that package first: a bare member host is the package's when
 * it ships one, else the project's. Its record and its members' logs go in a
 * folder named after the package.
 */

interface StartedMember {
  name: string;
  member: ChildWrapper;
  /** How the project addresses the member's host (PreparedMember.ref). */
  ref: string;
  specifier: string;
  kind: RunnerKind;
  verb: string;
  handle: StartedHandle;
  /** The outputs consumers read and the record holds: the handle's outputs
   * as parsed by the member runner's outputsSchema. */
  outputs: Record<string, unknown>;
}

export interface PreparedMember {
  key: string;
  member: ChildWrapper;
  draft: MemberDraft;
  specifier: string;
  runner: RunnerModule;
  file: string;
  /** How the project addresses the member's host: its folder, or
   * `<package>/<host>` for one a package supplies. An own-process member is
   * started by it, and the record names the member's host by it. */
  ref: string;
  /** The package that supplies the member's host. */
  hostPackage?: HostPackage;
}

/** `scope`: the package whose compound names the member (rule 3, D5). */
export async function memberDraft(
  projectRoot: string,
  member: ChildWrapper,
  scope?: HostPackage,
): Promise<MemberDraft> {
  return applyChildWrapper(
    (await loadHost(projectRoot, member.host, { scope })).host,
    member,
  );
}

/** Whether a member receives the compound's `cspRegistrySync` wiring (as
 * `runner.cspRegistrySync`): its runner declares that option (any specifier
 * that reaches the Connect runner), or it names the Connect runner. A
 * member's role is its runner, not its folder. */
export function takesCspRegistrySync(m: PreparedMember): boolean {
  return (
    m.specifier === CONNECT_RUNNER ||
    declaresKey(m.runner.hostSchema, ["runner"], "cspRegistrySync")
  );
}

export interface RunCompoundOptions {
  /** Project identity for the lock (defaults read from package.json by the CLI). */
  projectName: string;
  /** Extra record fields (e.g. mcpUrl). */
  recordExtra?: Record<string, unknown>;
  /** Registers the SIGINT/SIGTERM handlers (default true; tests pass false
   * and call `handleSignal`). */
  installSignalHandlers?: boolean;
  /** How the compound exits after a signal (default `process.exit`). */
  exit?: (code: number) => void;
  /** Stops the compound as SIGTERM would, once this delivers anything or
   * ends: see {@link stopStreamOf}. */
  stopStream?: NodeJS.ReadableStream;
  /** How long a stream's stop may take before exiting regardless (default
   * {@link STOP_STREAM_LIMIT_MS}). */
  stopStreamLimitMs?: number;
  /** What a stream's supervisor reads (default stdout and stderr). */
  supervisedOutputs?: readonly NodeJS.WritableStream[];
}

export { STOP_ON_STDIN_ENV };

/** Past the shell's own limit: this only matters when no shell is left. */
export const STOP_STREAM_LIMIT_MS = 15_000;

/**
 * Windows has no SIGTERM, so a supervisor asks a stack to stop through its
 * stdin: a line, or the pipe closing, which also covers the supervisor dying.
 * Only when it asks to: a stack started from a script may have no stdin.
 */
export function stopStreamOf(
  env: NodeJS.ProcessEnv,
  stdin: () => NodeJS.ReadableStream,
): NodeJS.ReadableStream | undefined {
  return env[STOP_ON_STDIN_ENV] === "1" ? stdin() : undefined;
}

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

export interface HoldStopOptions {
  /** How long the stop may take before exiting regardless (default
   * {@link STOP_STREAM_LIMIT_MS}). */
  limitMs?: number;
  /** What the supervisor reads (default stdout and stderr). */
  outputs?: readonly NodeJS.WritableStream[];
  /** Delivers the request; false when nothing handles it (default: SIGTERM
   * to this process's handlers). */
  signal?: () => boolean;
  exit?: (code: number) => void;
}

/**
 * A standalone host's stop through its supervisor's stream (stdin, under
 * {@link STOP_ON_STDIN_ENV}): a line or the end of it is delivered as the
 * stop channel delivers a request, to the SIGTERM handlers, else as exit
 * 143. Held until `started()`: a stop while the verb starts takes effect
 * once it has, so a store is never left half-opened.
 */
export function holdStopRequests(
  stream: NodeJS.ReadableStream,
  options: HoldStopOptions = {},
): { started(): void } {
  const exit = options.exit ?? ((code: number) => process.exit(code));
  const signal = options.signal ?? (() => process.emit("SIGTERM", "SIGTERM"));
  let asked = false;
  let up = false;
  const deliver = () => {
    // No supervisor may be left to end a stop that hangs.
    const limit = options.limitMs ?? STOP_STREAM_LIMIT_MS;
    setTimeout(() => exit(143), limit).unref();
    if (!signal()) exit(143);
  };
  whenStreamStops(stream, () => {
    asked = true;
    if (up) deliver();
  });
  // These go when the supervisor does, and with no listener the next log
  // line would be a fatal error in the middle of the shutdown it asked for.
  for (const output of options.outputs ?? [process.stdout, process.stderr]) {
    output.on("error", () => undefined);
  }
  return {
    started() {
      if (up) return;
      up = true;
      if (asked) deliver();
    },
  };
}

/** How long an own-process member may take to write its run record: a
 * store's first boot can be slow, and an in-process member has no limit. */
export const MEMBER_READY_TIMEOUT_MS = 600_000;

/** Per-run log files kept per own-process member (the services manager's
 * number). */
const MEMBER_RUN_LOGS = 5;

/** An id as a file name (the services manager's rule: `:` is no file name
 * on NTFS). */
const fileSafe = (id: string) => id.replace(/[<>:"/\\|?*]/g, "+");

/**
 * A fresh log file for this run of an own-process member, named as the
 * services manager names a service's: `<phDir>/services/<member>/
 * <member>.<runId>.log`, or `<phDir>/services/<package>/<member>/…` for a
 * compound the package `hostPackage` supplies. Older runs beyond the newest
 * few are removed.
 */
export function memberLogFile(
  projectRoot: string,
  env: Readonly<Record<string, string | undefined>>,
  member: string,
  hostPackage?: string,
): string {
  const safe = fileSafe(member);
  const dir = path.join(
    resolvePhDir(projectRoot, env),
    "services",
    ...(hostPackage === undefined ? [] : hostPackage.split("/")),
    safe,
  );
  fs.mkdirSync(dir, { recursive: true });
  const escaped = safe.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}\\.(\\d+)\\.log$`);
  const runId = (name: string) => Number(pattern.exec(name)?.[1]);
  const runs = fs
    .readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort((a, b) => runId(b) - runId(a));
  for (const old of runs.slice(MEMBER_RUN_LOGS - 1)) {
    try {
      fs.rmSync(path.join(dir, old));
    } catch {
      // in use, or gone
    }
  }
  let id = Date.now();
  while (fs.existsSync(path.join(dir, `${safe}.${id}.log`))) id += 1;
  return path.join(dir, `${safe}.${id}.log`);
}

/** Every URL among a member's outputs, by dotted path. */
export function urlEndpoints(outputs: unknown): Record<string, string> {
  const found: Record<string, string> = {};
  const walk = (value: unknown, at: string) => {
    if (typeof value === "string") {
      if (/^[a-z][a-z\d+.-]*:\/\//i.test(value)) found[at] = value;
    } else if (Array.isArray(value)) {
      value.forEach((item, i) => walk(item, at ? `${at}.${i}` : String(i)));
    } else if (isPlainObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        walk(item, at ? `${at}.${key}` : key);
      }
    }
  };
  walk(outputs, "");
  return found;
}

/** A member as {@link planForeground} reads it. */
export interface ForegroundCandidate {
  key: string;
  specifier: string;
  member: Pick<ChildWrapper, "process">;
  runner: Pick<RunnerModule, "foreground">;
}

export interface ForegroundPlan {
  /** The member whose runner owns the terminal, when there is one. */
  foreground?: string;
  /** The start order: the plan's, with the foreground member last. */
  order: string[];
  /** Broken foreground rules; `ph run` refuses the first. */
  issues: RunnerIssue[];
}

/**
 * The member whose runner owns the terminal (`foreground: true`) and the
 * order the compound starts its members in. Its rules: one such member at
 * most, in the compound's process, and last, so no member reads its outputs
 * and a `startOrder` that names it puts it at the end. `runCompound` refuses
 * the first broken one; `ph host check` reports them all.
 */
export function planForeground(
  members: readonly ForegroundCandidate[],
  plan: CompoundPlan,
  wiring: CompoundWiring,
): ForegroundPlan {
  const owners = members.filter((m) => m.runner.foreground === true);
  if (owners.length === 0) return { order: plan.order, issues: [] };
  if (owners.length > 1) {
    return {
      order: plan.order,
      issues: [
        {
          path: "children",
          message: `members ${owners.map((m) => `"${m.key}"`).join(", ")} each run a runner that owns the terminal; a compound has one.`,
        },
      ],
    };
  }
  const [owner] = owners;
  const where = `member "${owner.key}" (${owner.specifier})`;
  const issues: RunnerIssue[] = [];
  if (owner.member.process === "own") {
    issues.push({
      path: `children.${owner.key}.process`,
      message: `${where} owns the terminal, so it runs in the compound's process, not its own.`,
      hint: `Remove children.${owner.key}.process.`,
    });
  }
  const readers = plan.edges.filter((edge) => edge.producer === owner.key);
  if (readers.length > 0) {
    issues.push({
      path: "children",
      message: `${readers.map((edge) => `${edge.consumer}.${edge.path}`).join(", ")} read the outputs of ${where}, which owns the terminal and starts last.`,
    });
  }
  const named = wiring.startOrder;
  if (named?.includes(owner.key) && named.at(-1) !== owner.key) {
    issues.push({
      path: "config.startOrder",
      message: `config.startOrder starts ${where} before ${named.slice(named.indexOf(owner.key) + 1).join(", ")}, but it owns the terminal and starts last.`,
      hint: "Put it last in startOrder, or leave it out.",
    });
  }
  return {
    foreground: owner.key,
    order: [...plan.order.filter((key) => key !== owner.key), owner.key],
    issues,
  };
}

/** Where a member runs: `own` (a child process) or `shared` (the
 * compound's). The foreground member and every member at a one-shot verb
 * share the compound's; next to a foreground member the default is `own`. */
export function memberProcessOf(
  member: Pick<ChildWrapper, "process">,
  options: {
    /** It is the foreground member. */
    foreground: boolean;
    /** The compound has a foreground member. */
    besideForeground: boolean;
    /** It runs at a one-shot verb (build). */
    oneShot: boolean;
  },
): MemberProcess {
  if (options.foreground || options.oneShot) return "shared";
  return member.process ?? (options.besideForeground ? "own" : "shared");
}

export interface RunCompoundResult {
  started: StartedMember[];
  /** Graceful teardown, consumers before producers (reverse dependency
   * order); memoized. */
  shutdown: () => Promise<void>;
  /** What the compound's signal handlers run: the first signal shuts the
   * members down and exits once (130 / 143); later signals are ignored
   * while that teardown runs. */
  handleSignal: (signal: "SIGINT" | "SIGTERM") => Promise<void>;
}

/** The verb the generic compound starts its members at for its own `verb`:
 * `run` follows the compound's defaultVerb. */
export function compoundStartVerb(
  verb: string,
  runner: { defaultVerb?: string },
): string {
  return verb === "run" ? (runner.defaultVerb ?? "run") : verb;
}

/** At compound verb "run" each member runs its own (merged) defaultVerb —
 * what lets a desktop compound pair a switchboard at `run` with a connect at
 * `serve`. An explicit forwarded verb stays uniform across members. */
export function memberVerbOf(
  compoundVerb: string,
  runner: { defaultVerb?: string },
): string {
  return compoundVerb === "run" ? (runner.defaultVerb ?? "run") : compoundVerb;
}

export async function runCompound(
  hostInput: HostDefinition,
  ctx: RunnerContext,
  options: RunCompoundOptions,
): Promise<RunCompoundResult> {
  // The package that supplies this compound: its members are its first.
  const scope = ctx.hostPackage;
  const compoundFile = scope
    ? `${scope.name}/hosts/${hostInput.name}`
    : `hosts/${hostInput.name}`;
  const removed = findRemovedForms(hostInput);
  if (removed.length > 0) {
    throw new RunnerError(
      `${compoundFile}: removed form:\n${removed.map((r) => `  - ${r.path}: ${r.message}`).join("\n")}`,
    );
  }
  // Declared form: member wrappers may hold tokens (resolved per member).
  const parsed = declaredGenericCompoundHostSchema.safeParse(hostInput);
  if (!parsed.success) {
    throw new Error(
      `${compoundFile}: invalid compound host:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const host = parsed.data;
  const projectRoot = ctx.projectRoot;
  const wiring: CompoundWiring = host.config ?? {};
  // Resolved by the calling runner module: its `run` maps to defaultVerb.
  const verb = ctx.verb;
  // A one-shot compound verb (build) starts nothing: no lock, and no record
  // to write or clear (clearing would delete a live instance's record).
  const oneShotCompound = ONE_SHOT_VERBS.has(verb);

  // From the start, so a stop during boot takes effect when boot finishes.
  let stopRequested = false;
  let stopFromStream: () => void = () => {
    stopRequested = true;
  };
  if (options.stopStream && !oneShotCompound) {
    whenStreamStops(options.stopStream, () => stopFromStream());
    // These go when the supervisor does, and with no listener the next log
    // line would be a fatal error in the middle of the shutdown it started.
    const outputs = options.supervisedOutputs ?? [
      process.stdout,
      process.stderr,
    ];
    for (const output of outputs) output.on("error", () => undefined);
  }

  // Lock: one live instance per project per host (storage-root contention).
  const recordKey = runRecordKey(host.name, scope?.name);
  const probe = oneShotCompound
    ? undefined
    : probeRun(projectRoot, recordKey, options.projectName);
  const live = probe?.status === "live" ? probe.record : undefined;
  const running = live
    ? new Error(
        `${recordKey} is already running for this project (pid ${live.pid}). ` +
          `Stop it before starting another.`,
      )
    : undefined;
  // Only a command for its foreground member may run beside it (below).
  if (running && (ctx.argv ?? []).length === 0) throw running;
  if (probe?.status === "foreign") {
    throw new Error(
      `.ph/run/${recordKey}.json describes a live "${probe.record.projectName}", ` +
        `but this project is "${options.projectName}". Refusing to start a second instance.`,
    );
  }
  // stale record: proceed (a dead pid does not hold the lock)

  // Declared phase: every member's draft, runner and tokens, before any
  // member starts — a bad token or order fails with nothing running.
  let prepared: PreparedMember[];
  let order: string[];
  let foreground: string | undefined;
  let memberArgv: Map<string, string[]>;
  const byKey = new Map<string, PreparedMember>();
  try {
    prepared = await prepareMembers(projectRoot, host.children, scope);
    const cycle = await memberCycle(projectRoot, prepared);
    if (cycle) {
      throw new RunnerError(
        `${compoundFile}: compound member cycle: ${cycle.join(" -> ")}.`,
        "A compound cannot run itself, directly or through another compound.",
      );
    }
    const plan = planCompound(
      prepared.map((m) => ({
        key: m.key,
        host: m.member.host,
        refs: outputSitesOf(m.draft).map(({ ref, path }) => ({ ref, path })),
      })),
      wiring.startOrder,
    );
    for (const m of prepared) byKey.set(m.key, m);
    const declared = prepared.map((m) => ({ key: m.key, host: m.member.host }));
    for (const m of prepared) {
      validateDeclaredHost(m.runner, m.specifier, m.draft, m.file, {
        outputsSchemaOf: (ref) => {
          const target = memberForRef(ref, declared);
          if ("error" in target) return { error: target.error };
          const producer = byKey.get(target.key);
          return producer
            ? runnerOutputsSchema(
                producer.runner,
                producer.specifier,
                `member "${target.key}"`,
              )
            : {
                error: `names member "${target.key}", which was not prepared.`,
              };
        },
      });
    }
    const planned = planForeground(prepared, plan, wiring);
    const broken = planned.issues.at(0);
    if (broken) {
      throw new RunnerError(`${compoundFile}: ${broken.message}`, broken.hint);
    }
    foreground = planned.foreground;
    order = planned.order;

    // This invocation's arguments, per member: one no member accepts fails
    // with nothing running.
    memberArgv = splitCompoundArgv(
      ctx.argv ?? [],
      hostInput.name,
      prepared.map((m) => ({
        key: m.key,
        runner: m.specifier,
        schema: m.runner.argsSchema,
      })),
      foreground,
    );
  } catch (error) {
    // A running instance is what stands in the way, whatever else is wrong.
    throw running ?? error;
  }
  // A command beside the running instance: its foreground member alone, on
  // the outputs the live record holds. Nothing else of it starts, and there
  // is no lock to take or record to write.
  const beside = running !== undefined;
  if (
    running &&
    (foreground === undefined ||
      (memberArgv.get(foreground) ?? []).length === 0)
  ) {
    throw running;
  }
  const keepsRecord =
    wiring.runtimeRecord !== false && !oneShotCompound && !beside;
  const members = prepared.map((m) => ({ key: m.key, host: m.member.host }));

  if (wiring.cspRegistrySync && !prepared.some(takesCspRegistrySync)) {
    console.warn(
      `${compoundFile}: config.cspRegistrySync is set, but no member's runner declares runner.cspRegistrySync (members run: ${prepared.map((m) => m.specifier).join(", ")}); the baked Connect CSP is not patched for the runtime registry.`,
    );
  }

  const started: StartedMember[] = [];
  const liveOutputs = new Map<string, Record<string, unknown>>();
  for (const [key, member] of Object.entries(live?.members ?? {})) {
    liveOutputs.set(key, member.outputs);
  }
  const outputs = compoundOutputSource(
    members,
    liveOutputs,
    host.name,
    new Map(prepared.map((m) => [m.key, m.runner.outputsSchema])),
  );
  const resolveEnv = processResolveEnv(projectRoot, ctx.env);
  // What the foreground member is shown of the others.
  const statuses = new Map<string, MemberStatus>();
  const othersSeen = (): MemberStatus[] =>
    [...statuses.values()]
      .filter((status) => status.name !== foreground)
      .map((status) => ({ ...status, endpoints: { ...status.endpoints } }));

  // Members start in plan order (producers first), so the reverse is
  // reverse dependency order: a consumer stops before what it reads.
  let stopping: Promise<void> | undefined;
  const shutdown = () =>
    (stopping ??= (async () => {
      for (const m of [...started].reverse()) {
        const status = statuses.get(m.name);
        if (status?.status === "starting" || status?.status === "ready") {
          status.status = "stopping";
        }
        try {
          await m.handle.shutdown?.();
        } catch {
          // best effort — keep tearing down the rest
        }
        if (status?.status === "stopping") status.status = "stopped";
      }
      if (keepsRecord) clearRunRecord(projectRoot, recordKey);
    })());

  // An own-process member that died on its own: what to print, and (once the
  // stack is up) what ends it. Before that, the start fails on it.
  const death: { message?: string; ends?: () => void } = {};

  try {
    for (const name of order) {
      if (death.message) throw new Error(death.message);
      const m = byKey.get(name);
      if (!m) continue;
      const isForeground = name === foreground;
      // Beside a running instance only its foreground member starts. The
      // foreground member is the stack's terminal: it runs at its own
      // default verb, and at a one-shot verb (build) it has nothing to do.
      if (beside && !isForeground) continue;
      if (isForeground && oneShotCompound) continue;
      const memberVerb = isForeground
        ? (m.draft.runner.defaultVerb ?? "run")
        : memberVerbOf(verb, m.draft.runner);
      const oneShot = ONE_SHOT_VERBS.has(memberVerb);
      const memberProcess = memberProcessOf(m.member, {
        foreground: isForeground,
        besideForeground: foreground !== undefined,
        oneShot,
      });
      // A one-shot member (build) needs no other member's outputs: it gets
      // its declared host with only the "${userData}"/"${projectRoot}"
      // string sugar substituted (tokens stay; its verb reads paths, never
      // outputs; a $map reaches the verb as an empty collection). Everything
      // else resolves against the members started before it and is
      // validated in resolved form.
      const resolved = oneShot
        ? substituteBuiltinEnv(m.draft, resolveEnv.builtins ?? {})
        : resolveHostOutputs(m.draft, {
            outputs,
            ...resolveEnv,
            where: m.file,
          });
      if (wiring.cspRegistrySync && takesCspRegistrySync(m)) {
        resolved.runner = { ...resolved.runner, cspRegistrySync: true };
      }
      const validated = validateHost(
        m.runner,
        m.specifier,
        resolved,
        m.file,
        oneShot ? { tokens: "allow" } : {},
      );
      const fn = getVerb(m.runner, m.specifier, memberVerb);
      const where = `${name} (${m.specifier} ${memberVerb})`;
      const argv = memberArgv.get(name) ?? [];
      const status: MemberStatus = {
        name,
        host: m.ref,
        process: memberProcess,
        status: "starting",
        endpoints: {},
      };
      statuses.set(name, status);
      let handle: StartedHandle;
      if (memberProcess === "own") {
        // Ready once its record is written: its `ready` has resolved.
        const own = await startOwnProcess({
          projectRoot,
          compound: host.name,
          member: name,
          // As the project addresses it: a bare name in a package's compound
          // may be the package's host, which the child's `ph run` must get.
          folder: m.ref,
          verb: memberVerb,
          argv,
          env: ctx.env,
          host: resolved,
          // In-process members print here too; next to the terminal's
          // owner, output would draw into it.
          echo: foreground === undefined,
          ...(scope ? { logPackage: scope.name } : {}),
        });
        handle = own.handle;
        status.pid = own.pid;
        status.logFile = own.logFile;
        void own.exited.then((exit) => {
          // Only an exit the compound did not ask for (it marks a member
          // `stopping` before it stops it).
          if (status.status !== "starting" && status.status !== "ready") {
            return;
          }
          status.status = exit.code === 0 ? "stopped" : "failed";
          const how =
            exit.signal !== null
              ? `signal ${exit.signal}`
              : `code ${exit.code}`;
          status.error = `exited (${how}) while the stack runs; its log: ${own.logFile}`;
          // A long-running member that ends, whatever its code, fails the
          // stack.
          death.message ??= `${compoundFile}: member "${name}" ${status.error}`;
          death.ends?.();
        });
      } else {
        handle = toStartedHandle(
          await fn(oneShot ? emptyMaps(validated, resolved) : validated, {
            projectRoot,
            ...(m.hostPackage ? { hostPackage: m.hostPackage } : {}),
            env: ctx.env,
            verb: memberVerb,
            parent: { host: host.name, verb },
            ...(argv.length > 0 ? { argv } : {}),
            ...(isForeground
              ? { foreground: { members: othersSeen, beside } }
              : {}),
          }),
          where,
        );
        status.pid = process.pid;
      }
      // Registered before `ready` settles, so a failed start still tears
      // this member down.
      started.push({
        name,
        member: m.member,
        ref: m.ref,
        specifier: m.specifier,
        kind: m.runner.kind,
        verb: memberVerb,
        handle,
        outputs: handle.outputs,
      });
      if (handle.ready) await handle.ready;
      // Consumers and the record see the PARSED outputs (schema defaults,
      // transforms, stripped keys), as a standalone run publishes them.
      let memberOutputs = handle.outputs;
      if (!oneShot && isSchemaLike(m.runner.outputsSchema)) {
        const checked = m.runner.outputsSchema.safeParse(handle.outputs);
        if (!checked.success) {
          throw new Error(
            `${where} reported outputs that fail its outputsSchema:\n${checked.error.issues.map((i) => `  - ${i.path.map(String).join(".") || "<root>"}: ${i.message}`).join("\n")}`,
          );
        }
        if (!isPlainObject(checked.data)) {
          throw new Error(
            `${where}: its outputsSchema parsed the outputs to ${JSON.stringify(checked.data)}, not an object.`,
          );
        }
        memberOutputs = checked.data;
      }
      started[started.length - 1].outputs = memberOutputs;
      liveOutputs.set(name, memberOutputs);
      if (status.status === "starting") status.status = "ready";
      status.endpoints = urlEndpoints(memberOutputs);
    }
    if (death.message) throw new Error(death.message);
  } catch (error) {
    await shutdown();
    throw error;
  }

  if (keepsRecord) {
    const recordMembers: Record<string, RunRecordMember> = {};
    for (const m of started) {
      recordMembers[m.name] = {
        host: m.ref,
        runnerModule: m.specifier,
        kind: m.kind,
        verb: m.verb,
        outputs: m.outputs,
      };
    }
    writeRunRecord(projectRoot, {
      version: 2,
      host: host.name,
      ...(scope ? { package: scope.name } : {}),
      projectName: options.projectName,
      kind: "compound",
      verb,
      pid: process.pid,
      startedAt: new Date().toISOString(),
      members: recordMembers,
      ...(options.recordExtra ? { extra: options.recordExtra } : {}),
    });
  }

  // The compound owns the exit: members run without process-exiting signal
  // handlers (ctx.parent is set), so one Ctrl-C reaches only this handler.
  // The first end decides the code: a signal's, or the foreground member's.
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let ending: Promise<void> | undefined;
  const end = (code: number, afterStop?: () => void) =>
    (ending ??= shutdown().finally(() => {
      afterStop?.();
      exit(code);
    }));
  const handleSignal = (signal: "SIGINT" | "SIGTERM") =>
    end(signal === "SIGINT" ? 130 : 143);
  if (options.installSignalHandlers !== false) {
    process.on("exit", () => {
      if (keepsRecord) clearRunRecord(projectRoot, recordKey);
    });
    process.on("SIGINT", () => void handleSignal("SIGINT"));
    process.on("SIGTERM", () => void handleSignal("SIGTERM"));
  }
  stopFromStream = () => {
    // No supervisor may be left to end a shutdown that hangs.
    const limit = options.stopStreamLimitMs ?? STOP_STREAM_LIMIT_MS;
    setTimeout(() => exit(143), limit).unref();
    void handleSignal("SIGTERM");
  };
  if (stopRequested) stopFromStream();

  // A member that dies on its own takes the stack down with exit code 1. The
  // message waits until the others (the terminal's owner first) have stopped,
  // so it does not land in a drawing.
  death.ends = () => void end(1, () => console.error(death.message));
  // One that died between the last check above and here.
  if (death.message) death.ends();

  // The foreground member's end is the stack's: the rest stop, and the
  // process exits with its code.
  const exited = started.find((m) => m.name === foreground)?.handle.exited;
  if (exited) {
    Promise.resolve(exited).then(
      (code) => void end(typeof code === "number" ? code : 0),
      () => void end(1),
    );
  }

  return { started, shutdown, handleSignal };
}

interface OwnProcessStart {
  projectRoot: string;
  compound: string;
  member: string;
  folder: string;
  verb: string;
  argv: readonly string[];
  env: Readonly<Record<string, string | undefined>>;
  /** The member's host, resolved: what the child runs. */
  host: Record<string, unknown>;
  /** Also write its output to this process's stdout and stderr. */
  echo: boolean;
  /** The package that supplies the compound: its members' logs are in a
   * folder named after it. */
  logPackage?: string;
}

/**
 * An own-process member: `ph run <folder> <verb> -- <argv>` as an attached,
 * hidden child (spawnHost) with the compound's env, its resolved host and a
 * stdin it stops on; its output in this run's log file. Resolves once its
 * run record is written, which its `ph run` does after `ready`.
 */
async function startOwnProcess(start: OwnProcessStart) {
  const logFile = memberLogFile(
    start.projectRoot,
    start.env,
    start.member,
    start.logPackage,
  );
  const spawned = await spawnHost({
    projectRoot: start.projectRoot,
    host: start.folder,
    // The compound's own: the member's stores and record are where they
    // would be in the compound's process.
    dataDir: defaultUserDataDir(start.projectRoot, start.env),
    verb: start.verb,
    argv: start.argv,
    baseEnv: start.env,
    definition: {
      compound: start.compound,
      member: start.member,
      host: start.host,
    },
    stopOnStdin: true,
    logFile,
    readyTimeoutMs: MEMBER_READY_TIMEOUT_MS,
    ...(start.echo
      ? {
          onOutput: (stream: "stdout" | "stderr", chunk: string) => {
            process[stream].write(chunk);
          },
        }
      : {}),
  });
  const handle: StartedHandle = {
    outputs: spawned.outputs ?? {},
    shutdown: () => spawned.stop(),
  };
  return { handle, pid: spawned.pid, logFile, exited: spawned.exited };
}

/** Load every member's draft and runner, in declaration order. */
async function prepareMembers(
  projectRoot: string,
  children: Record<string, ChildWrapper>,
  scope?: HostPackage,
): Promise<PreparedMember[]> {
  const out: PreparedMember[] = [];
  for (const [key, member] of Object.entries(children)) {
    out.push(await prepareMember(projectRoot, key, member, scope));
  }
  return out;
}

/** One member's draft and runner. `scope`: the package whose compound names
 * the member, where a bare member host is looked up first; the runner
 * resolves from the package that supplies the member's host. */
export async function prepareMember(
  projectRoot: string,
  key: string,
  member: ChildWrapper,
  scope?: HostPackage,
): Promise<PreparedMember> {
  const loaded = await loadHost(projectRoot, member.host, { scope });
  const draft = applyChildWrapper(loaded.host, member);
  const specifier = draft.runner.module;
  return {
    key,
    member,
    draft,
    specifier,
    runner: await resolveRunnerModule(
      moduleRootOf(projectRoot, loaded),
      specifier,
    ),
    file: hostFileLabel(loaded.name, loaded.package),
    ref: loaded.ref ?? member.host,
    ...(loaded.package ? { hostPackage: loaded.package } : {}),
  };
}

/**
 * A compound that is, through its compound members, a member of itself
 * would start itself without end: the chain of hosts, as the project
 * addresses them, when there is one. Each compound member's own members are
 * looked up as it looks them up (its package first, for a package's). A
 * reactor member ends a chain.
 */
export async function memberCycle(
  projectRoot: string,
  prepared: readonly PreparedMember[],
): Promise<string[] | undefined> {
  const walk = async (
    chain: string[],
    children: Record<string, ChildWrapper>,
    scope: HostPackage | undefined,
  ): Promise<string[] | undefined> => {
    for (const member of Object.values(children)) {
      const loaded = await loadHost(projectRoot, member.host, { scope });
      const ref = loaded.ref ?? member.host;
      if (chain.includes(ref)) return [...chain, ref];
      const nested = (loaded.host as { children?: unknown }).children;
      if (!isPlainObject(nested)) continue;
      const found = await walk(
        [...chain, ref],
        nested as Record<string, ChildWrapper>,
        loaded.package,
      );
      if (found) return found;
    }
    return undefined;
  };
  for (const m of prepared) {
    const nested = (m.draft as { children?: unknown }).children;
    if (!isPlainObject(nested)) continue;
    const found = await walk(
      [m.ref],
      nested as Record<string, ChildWrapper>,
      m.hostPackage,
    );
    if (found) return found;
  }
  return undefined;
}
