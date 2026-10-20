import { z } from "zod";
import {
  declaredGenericCompoundHostSchema,
  type ChildWrapper,
  type CompoundWiring,
  type HostDefinition,
  type RunnerKind,
} from "./host-schemas.js";
import { substituteBuiltinEnv } from "./env-substitution.js";
import { loadHost } from "./host-loader.js";
import { outputSitesOf } from "./resolve/declared.js";
import { processResolveEnv, runnerOutputsSchema } from "./resolve/node.js";
import { memberForRef, planCompound } from "./resolve/plan.js";
import { findRemovedForms } from "./resolve/removed-forms.js";
import { resolveHostOutputs } from "./resolve/resolve.js";
import { compoundOutputSource } from "./resolve/sources.js";
import {
  clearRunRecord,
  probeRun,
  writeRunRecord,
  type RunRecordMember,
} from "./run-record.js";
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
  type RunnerContext,
  type RunnerModule,
} from "./runner-resolver.js";

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
 * Attached and in-process: member verbs start their servers (which hold the
 * event loop) and return a handle; the compound lives as long as they do.
 */

interface StartedMember {
  name: string;
  member: ChildWrapper;
  specifier: string;
  kind: RunnerKind;
  verb: string;
  handle: StartedHandle;
}

/** A member host before its runner validates it: the member's host.js with
 * the wrapper applied (tokens still in place). */
type MemberDraft = Record<string, unknown> & {
  name: string;
  runner: HostDefinition["runner"];
};

interface PreparedMember {
  key: string;
  member: ChildWrapper;
  draft: MemberDraft;
  specifier: string;
  runner: RunnerModule;
  file: string;
}

/** Build the member host object the member runner sees: the member's own
 * host.js with the wrapper applied. A wrapper SECTION is a FULL STATEMENT —
 * `reactor` and `config`, when present on the wrapper, replace the member's
 * wholesale; `runner` key-merges (wrappers override port, host, plugins…). */
async function memberDraft(
  projectRoot: string,
  member: ChildWrapper,
): Promise<MemberDraft> {
  const base: HostDefinition = (await loadHost(projectRoot, member.host)).host;
  const reactor = member.reactor ?? base.reactor;
  const config = member.config ?? base.config;
  return {
    ...base,
    runner: { ...base.runner, ...member.runner },
    ...(config !== undefined ? { config } : {}),
    ...(reactor !== undefined ? { reactor } : {}),
  };
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

/** At compound verb "run" each member runs its own (merged) defaultVerb —
 * what lets a desktop compound pair a switchboard at `run` with a connect at
 * `serve`. An explicit forwarded verb stays uniform across members. */
function memberVerbOf(
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
  const compoundFile = `hosts/${hostInput.name}`;
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
  const keepsRecord = wiring.runtimeRecord !== false && !oneShotCompound;

  // Lock: one live instance per project per host (storage-root contention).
  const probe = oneShotCompound
    ? undefined
    : probeRun(projectRoot, host.name, options.projectName);
  if (probe?.status === "live") {
    throw new Error(
      `${host.name} is already running for this project (pid ${probe.record.pid}). ` +
        `Stop it before starting another.`,
    );
  }
  if (probe?.status === "foreign") {
    throw new Error(
      `.ph/run/${host.name}.json describes a live "${probe.record.projectName}", ` +
        `but this project is "${options.projectName}". Refusing to start a second instance.`,
    );
  }
  // stale record: proceed (a dead pid does not hold the lock)

  // Declared phase: every member's draft, runner and tokens, before any
  // member starts — a bad token or order fails with nothing running.
  const prepared = await prepareMembers(projectRoot, host.children);
  const plan = planCompound(
    prepared.map((m) => ({
      key: m.key,
      host: m.member.host,
      refs: outputSitesOf(m.draft).map(({ ref, path }) => ({ ref, path })),
    })),
    wiring.startOrder,
  );
  const byKey = new Map(prepared.map((m) => [m.key, m]));
  const members = prepared.map((m) => ({ key: m.key, host: m.member.host }));
  for (const m of prepared) {
    validateDeclaredHost(m.runner, m.specifier, m.draft, m.file, {
      outputsSchemaOf: (ref) => {
        const target = memberForRef(ref, members);
        if ("error" in target) return { error: target.error };
        const producer = byKey.get(target.key);
        return producer
          ? runnerOutputsSchema(
              producer.runner,
              producer.specifier,
              `member "${target.key}"`,
            )
          : { error: `names member "${target.key}", which was not prepared.` };
      },
    });
  }

  const started: StartedMember[] = [];
  const liveOutputs = new Map<string, Record<string, unknown>>();
  const outputs = compoundOutputSource(members, liveOutputs, host.name);
  const resolveEnv = processResolveEnv(projectRoot, ctx.env);

  // Members start in plan order (producers first), so the reverse is
  // reverse dependency order: a consumer stops before what it reads.
  let stopping: Promise<void> | undefined;
  const shutdown = () =>
    (stopping ??= (async () => {
      for (const m of [...started].reverse()) {
        try {
          await m.handle.shutdown?.();
        } catch {
          // best effort — keep tearing down the rest
        }
      }
      if (keepsRecord) clearRunRecord(projectRoot, host.name);
    })());

  try {
    for (const name of plan.order) {
      const m = byKey.get(name);
      if (!m) continue;
      const memberVerb = memberVerbOf(verb, m.draft.runner);
      const oneShot = ONE_SHOT_VERBS.has(memberVerb);
      // A one-shot member (build) needs no other member's outputs: it gets
      // its declared host with only the "${userData}"/"${projectRoot}"
      // string sugar substituted (tokens stay; its verb reads paths, never
      // outputs). Everything else resolves against the members started
      // before it and is validated in resolved form.
      const resolved = oneShot
        ? substituteBuiltinEnv(m.draft, resolveEnv.builtins ?? {})
        : resolveHostOutputs(m.draft, {
            outputs,
            ...resolveEnv,
            where: m.file,
          });
      if (wiring.cspRegistrySync && m.specifier === CONNECT_RUNNER) {
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
      const handle = toStartedHandle(
        await fn(validated, {
          projectRoot,
          env: ctx.env,
          verb: memberVerb,
          parent: { host: host.name, verb },
        }),
        where,
      );
      // Registered before `ready` settles, so a failed start still tears
      // this member down.
      started.push({
        name,
        member: m.member,
        specifier: m.specifier,
        kind: m.runner.kind,
        verb: memberVerb,
        handle,
      });
      if (handle.ready) await handle.ready;
      if (!oneShot && isSchemaLike(m.runner.outputsSchema)) {
        const checked = m.runner.outputsSchema.safeParse(handle.outputs);
        if (!checked.success) {
          throw new Error(
            `${where} reported outputs that fail its outputsSchema:\n${checked.error.issues.map((i) => `  - ${i.path.map(String).join(".") || "<root>"}: ${i.message}`).join("\n")}`,
          );
        }
      }
      liveOutputs.set(name, handle.outputs);
    }
  } catch (error) {
    await shutdown();
    throw error;
  }

  if (keepsRecord) {
    const recordMembers: Record<string, RunRecordMember> = {};
    for (const m of started) {
      recordMembers[m.name] = {
        host: m.member.host,
        runnerModule: m.specifier,
        kind: m.kind,
        verb: m.verb,
        outputs: m.handle.outputs,
      };
    }
    writeRunRecord(projectRoot, {
      version: 2,
      host: host.name,
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
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let signalled: Promise<void> | undefined;
  const handleSignal = (signal: "SIGINT" | "SIGTERM") => {
    if (signalled) return signalled;
    const code = signal === "SIGINT" ? 130 : 143;
    signalled = shutdown().finally(() => exit(code));
    return signalled;
  };
  if (options.installSignalHandlers !== false) {
    process.on("exit", () => {
      if (keepsRecord) clearRunRecord(projectRoot, host.name);
    });
    process.on("SIGINT", () => void handleSignal("SIGINT"));
    process.on("SIGTERM", () => void handleSignal("SIGTERM"));
  }

  return { started, shutdown, handleSignal };
}

/** Load every member's draft and runner, in declaration order. */
async function prepareMembers(
  projectRoot: string,
  children: Record<string, ChildWrapper>,
): Promise<PreparedMember[]> {
  const out: PreparedMember[] = [];
  for (const [key, member] of Object.entries(children)) {
    const draft = await memberDraft(projectRoot, member);
    const specifier = draft.runner.module;
    out.push({
      key,
      member,
      draft,
      specifier,
      runner: await resolveRunnerModule(projectRoot, specifier),
      file: `hosts/${member.host}/host.js`,
    });
  }
  return out;
}
