import type { HostDefinition } from "./host-loader.js";
import { loadHost } from "./host-loader.js";
import { projectDrivesIntoConnect } from "./connect-projection.js";
import {
  defaultUserDataDir,
  resolveUserDataPlaceholders,
} from "./placeholders.js";
import {
  clearRunRecord,
  probeRun,
  writeRunRecord,
  type RunRecordMember,
} from "./run-record.js";
import {
  getVerb,
  resolveRunnerModule,
  validateHost,
  type RunnerContext,
} from "./runner-resolver.js";

/**
 * The generic compound runner: supervises the members a compound host
 * declares, each started via its OWN declared runner at the compound's member
 * verb. It projects a reactor member's created drives into a connect member's
 * config, writes a .ph/run/<host>.json record, holds a per-project lock, and
 * tears members down in reverse order on shutdown.
 *
 * Phase-1 model is ATTACHED and in-process: member runner verbs start their
 * servers (which hold the event loop) and return a handle of facts; the
 * compound stays alive as long as they do. Detached supervision is phase 5.
 */

/** Facts a member runner verb returns so the compound can project and tear
 * down. All optional: a void-returning verb is treated as "started, no facts,
 * self-sustaining" (the phase-0 bridges). */
export interface RunnerHandle {
  /** Port the member bound. */
  port?: number;
  /** Drive URLs a reactor member created, in display order — projected into a
   * connect member's defaultDrives. */
  driveUrls?: (string | null | undefined)[];
  /** Named endpoints (graphql, mcp, …) for the run record / diagnostics. */
  endpoints?: Record<string, string>;
  /** Resolves when the member is serving; the compound awaits it before the
   * next member when ordering requires readiness. */
  ready?: Promise<void>;
  /** Reverse-order teardown. */
  shutdown?: () => void | Promise<void>;
}

export interface CompoundMember {
  host: string;
  plugins?: string[];
  runner?: { port?: number } & Record<string, unknown>;
  config?: Record<string, unknown>;
  reactor?: Record<string, unknown>;
}

export interface CompoundWiring {
  /** Project the reactor member's created drives into the connect member. */
  projectDrivesIntoConnect?: boolean;
  /** --drives-public-base equivalent. */
  drivesPublicBase?: string | null;
  /** Member start order; defaults to declaration order. */
  startOrder?: string[];
  /** Write .ph/run/<host>.json (default true). */
  runtimeRecord?: boolean;
  /** Patch the baked CSP for the runtime registry on a served connect member
   * (forwarded to the connect runner as a runner option). */
  cspRegistrySync?: boolean;
}

interface StartedMember {
  name: string;
  handle: RunnerHandle;
}

function memberEntries(host: HostDefinition): [string, CompoundMember][] {
  const children = (host.children ?? {}) as Record<string, CompoundMember>;
  return Object.entries(children);
}

function orderedMembers(
  host: HostDefinition,
  wiring: CompoundWiring,
): [string, CompoundMember][] {
  const entries = memberEntries(host);
  if (!wiring.startOrder) return entries;
  const byName = new Map(entries);
  const out: [string, CompoundMember][] = [];
  for (const name of wiring.startOrder) {
    const m = byName.get(name);
    if (m) {
      out.push([name, m]);
      byName.delete(name);
    }
  }
  // any not named in startOrder keep declaration order, after the named ones
  for (const [name, m] of entries) if (byName.has(name)) out.push([name, m]);
  return out;
}

/** Build the member host object the member runner sees: the member's own
 * host.js with the wrapper applied. R1 semantics (rewire plan): a wrapper
 * SECTION is a FULL STATEMENT — `reactor` and `config`, when present on the
 * wrapper, replace the member's wholesale (host files derive keeps explicitly
 * by spreading the sibling import: `{ ...switchboard.reactor, drives }`).
 * `runner` stays key-merged: wrappers never restate `module`/`defaultVerb`,
 * they override individual keys (port, host, plugins — the plugins LIST
 * itself is a full statement computed in the file). */
async function resolveMemberHost(
  projectRoot: string,
  member: CompoundMember,
  userData: string,
  configPatch?: Record<string, unknown>,
): Promise<HostDefinition> {
  const loaded = await loadHost(projectRoot, member.host);
  const base = loaded.host;
  const merged: HostDefinition = {
    ...base,
    runner: { ...base.runner, ...(member.runner ?? {}) },
    config: {
      ...(member.config !== undefined ? member.config : (base.config ?? {})),
      ...(configPatch ?? {}),
    },
    reactor: (member.reactor !== undefined ? member.reactor : base.reactor) as
      | Record<string, unknown>
      | undefined,
  };
  // ${userData} in the merged host (storage dirs etc.) resolves here — at the
  // runner, never derived from the instance name, so renames stay safe.
  return resolveUserDataPlaceholders(merged, userData);
}

function isConnectMember(member: CompoundMember): boolean {
  return member.host === "connect";
}
function isReactorFactMember(member: CompoundMember): boolean {
  return member.host === "switchboard";
}

export interface RunCompoundOptions {
  /** Project identity for the lock (defaults read from package.json by the CLI). */
  projectName: string;
  /** Extra record fields (e.g. mcpUrl). */
  recordExtra?: Record<string, unknown>;
  /** Registers signal handlers for teardown (default true; tests pass false). */
  installSignalHandlers?: boolean;
}

export interface RunCompoundResult {
  started: StartedMember[];
  shutdown: () => Promise<void>;
}

export async function runCompound(
  host: HostDefinition,
  ctx: RunnerContext,
  options: RunCompoundOptions,
): Promise<RunCompoundResult> {
  const projectRoot = ctx.projectRoot;
  const wiring = (host.config ?? {}) as CompoundWiring;
  // The member verb is ctx.verb, resolved by the CALLING runner module (its
  // `run` maps to defaultVerb; its dev/build/serve forward themselves) — the
  // engine never consults defaultVerb, so an explicit verb always wins.
  const verb = ctx.verb;

  // Lock: one live instance per project per host (storage-root contention).
  const probe = probeRun(projectRoot, host.name, options.projectName);
  if (probe.status === "live") {
    throw new Error(
      `${host.name} is already running for this project (pid ${probe.record.pid}). ` +
        `Stop it before starting another.`,
    );
  }
  if (probe.status === "foreign") {
    throw new Error(
      `.ph/run/${host.name}.json describes a live "${probe.record.projectName}", ` +
        `but this project is "${options.projectName}". Refusing to start a second instance.`,
    );
  }
  // stale record: proceed (a dead pid does not hold the lock)

  const userData = defaultUserDataDir(projectRoot, ctx.env);
  const started: StartedMember[] = [];
  const reactorFacts: { driveUrls: (string | null | undefined)[] } = {
    driveUrls: [],
  };

  const shutdown = async () => {
    for (const m of [...started].reverse()) {
      try {
        await m.handle.shutdown?.();
      } catch {
        // best effort — keep tearing down the rest
      }
    }
    if (wiring.runtimeRecord !== false) {
      clearRunRecord(projectRoot, host.name);
    }
  };

  for (const [name, member] of orderedMembers(host, wiring)) {
    // Compute a config patch for the connect member from reactor facts.
    let configPatch: Record<string, unknown> | undefined;
    if (
      isConnectMember(member) &&
      wiring.projectDrivesIntoConnect &&
      reactorFacts.driveUrls.length > 0
    ) {
      const configuredDefaultDrives = (
        (member.config as { drives?: { defaultDrives?: unknown } } | undefined)
          ?.drives as { defaultDrives?: unknown } | undefined
      )?.defaultDrives as never;
      configPatch = projectDrivesIntoConnect({
        createdDriveUrls: reactorFacts.driveUrls,
        configuredDefaultDrives,
        publicBase: wiring.drivesPublicBase,
      });
    }

    const memberHost = await resolveMemberHost(
      projectRoot,
      member,
      userData,
      configPatch,
    );
    if (isConnectMember(member) && wiring.cspRegistrySync) {
      memberHost.runner = { ...memberHost.runner, cspRegistrySync: true };
    }
    const specifier = memberHost.runner.module;
    const runner = await resolveRunnerModule(projectRoot, specifier);
    validateHost(runner, specifier, memberHost, `hosts/${member.host}/host.js`);
    // At compound verb "run", each member runs its own (merged) defaultVerb —
    // "each member's default mode" — which is what lets a desktop compound
    // pair a switchboard at `run` with a connect at `serve`. An explicit
    // forwarded verb (dev/build/serve) stays uniform across members.
    const memberVerb =
      verb === "run"
        ? ((memberHost.runner.defaultVerb as string | undefined) ?? "run")
        : verb;
    const fn = getVerb(runner, specifier, memberVerb);
    const handle = ((await fn(memberHost, ctx)) ?? {}) as RunnerHandle;
    if (handle.ready) await handle.ready;
    started.push({ name, handle });

    if (isReactorFactMember(member) && handle.driveUrls) {
      reactorFacts.driveUrls.push(...handle.driveUrls);
    }
  }

  if (wiring.runtimeRecord !== false) {
    const members: Record<string, RunRecordMember> = {};
    for (const m of started) {
      members[m.name] = {
        port: m.handle.port,
        url: m.handle.endpoints?.graphql ?? m.handle.endpoints?.connect,
      };
    }
    writeRunRecord(projectRoot, {
      pid: process.pid,
      hostName: host.name,
      projectName: options.projectName,
      startedAt: new Date().toISOString(),
      members,
      extra: options.recordExtra,
    });
  }

  if (options.installSignalHandlers !== false) {
    const onSignal = (code: number) => {
      void shutdown().finally(() => process.exit(code));
    };
    process.on("exit", () => {
      if (wiring.runtimeRecord !== false)
        clearRunRecord(projectRoot, host.name);
    });
    process.on("SIGINT", () => onSignal(130));
    process.on("SIGTERM", () => onSignal(143));
  }

  return { started, shutdown };
}
