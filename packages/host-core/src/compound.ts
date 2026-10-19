import type { PHConnectDefaultDrive } from "@powerhousedao/shared/clis";
import { z } from "zod";
import { projectDrivesIntoConnect } from "./connect-projection.js";
import {
  genericCompoundHostSchema,
  type ChildWrapper,
  type CompoundWiring,
  type HostDefinition,
  type RunnerKind,
} from "./host-schemas.js";
import { loadHost } from "./host-loader.js";
import {
  defaultUserDataDir,
  resolveUserDataPlaceholders,
} from "./placeholders.js";
import { unresolvedDriveReferences } from "./plugins.js";
import {
  clearRunRecord,
  probeRun,
  writeRunRecord,
  type RunRecordMember,
} from "./run-record.js";
import { toStartedHandle, type StartedHandle } from "./runner-handle.js";
import {
  getVerb,
  resolveRunnerModule,
  validateHost,
  type RunnerContext,
} from "./runner-resolver.js";

export type { ChildWrapper, CompoundWiring } from "./host-schemas.js";
export type { RunnerHandle, StartedHandle } from "./runner-handle.js";

/**
 * The generic compound runner: supervises the members a compound host
 * declares, each started via its OWN declared runner at its own effective
 * verb, writes a v2 .ph/run/<host>.json record, holds a per-project lock,
 * and tears members down in reverse order through their `shutdown()`.
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
 * the wrapper applied. */
type MemberDraft = Record<string, unknown> & {
  name: string;
  runner: HostDefinition["runner"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function orderedMembers(
  children: Record<string, ChildWrapper>,
  wiring: CompoundWiring,
): [string, ChildWrapper][] {
  const entries = Object.entries(children);
  if (!wiring.startOrder) return entries;
  const byName = new Map(entries);
  const out: [string, ChildWrapper][] = [];
  for (const name of wiring.startOrder) {
    const member = byName.get(name);
    if (member) {
      out.push([name, member]);
      byName.delete(name);
    }
  }
  // any not named in startOrder keep declaration order, after the named ones
  for (const [name, m] of entries) if (byName.has(name)) out.push([name, m]);
  return out;
}

/** Build the member host object the member runner sees: the member's own
 * host.js with the wrapper applied. A wrapper SECTION is a FULL STATEMENT —
 * `reactor` and `config`, when present on the wrapper, replace the member's
 * wholesale; `runner` key-merges (wrappers override port, host, plugins…). */
async function resolveMemberHost(
  projectRoot: string,
  member: ChildWrapper,
  userData: string,
  configPatch?: Record<string, unknown>,
): Promise<MemberDraft> {
  const base: HostDefinition = (await loadHost(projectRoot, member.host)).host;
  const reactor = member.reactor ?? base.reactor;
  const merged: MemberDraft = {
    ...base,
    runner: { ...base.runner, ...member.runner },
    config: { ...(member.config ?? base.config ?? {}), ...configPatch },
    ...(reactor !== undefined ? { reactor } : {}),
  };
  // ${userData} in the merged host (storage dirs etc.) resolves here — at the
  // runner, never derived from the instance name, so renames stay safe.
  return resolveUserDataPlaceholders(merged, userData);
}

interface DriveUrlSource {
  name: string;
  handle: { driveUrls?: (string | null | undefined)[] };
}

/**
 * Substitute DRIVE REFERENCES (`{ from: "<member>", slug }`) in the member's
 * plugin entry configs with the URL the referenced member's handle reported
 * in `driveUrls`. Fails loudly on an unknown member, a member that has not
 * started yet (fix startOrder) or a slug it does not serve. Removed in T3.
 */
export function resolveDriveReferences<
  H extends { runner: { plugins?: readonly unknown[] } },
>(
  memberHost: H,
  memberName: string,
  started: readonly DriveUrlSource[],
  declaredMembers: readonly string[],
): H {
  const plugins = memberHost.runner.plugins;
  if (!plugins) return memberHost;
  const substituted: string[] = [];
  const resolved = plugins.map((entry: unknown) => {
    if (!isRecord(entry)) return entry;
    const config = isRecord(entry.config) ? entry.config : undefined;
    const refs = unresolvedDriveReferences(config);
    if (refs.length === 0) return entry;
    const module = typeof entry.module === "string" ? entry.module : "(plugin)";
    const next = { ...config };
    for (const { key, reference } of refs) {
      const source = started.find((m) => m.name === reference.from);
      if (!source) {
        const hint = declaredMembers.includes(reference.from)
          ? `Member "${reference.from}" starts after "${memberName}"; list it first in config.startOrder.`
          : `Members declared: ${declaredMembers.join(", ")}.`;
        throw new Error(
          `${memberName}: plugin "${module}" config.${key} refers to drive "${reference.slug}" of member "${reference.from}", which is not started. ${hint}`,
        );
      }
      const urls = (source.handle.driveUrls ?? []).filter(
        (u): u is string => typeof u === "string",
      );
      const url = urls.find((u) => driveSlugOfUrl(u) === reference.slug);
      if (!url) {
        throw new Error(
          `${memberName}: plugin "${module}" config.${key} refers to drive "${reference.slug}" of member "${reference.from}", which serves ${urls.length ? urls.map((u) => `"${driveSlugOfUrl(u)}"`).join(", ") : "no drives"}.`,
        );
      }
      next[key] = url;
      substituted.push(`${module}.${key}`);
    }
    return { ...entry, config: next };
  });
  if (substituted.length === 0) return memberHost;
  return { ...memberHost, runner: { ...memberHost.runner, plugins: resolved } };
}

/** The `<slug>` of a `…/d/<slug>` drive URL (undefined for other URLs). */
function driveSlugOfUrl(url: string): string | undefined {
  const match = /\/d\/([^/?#]+)\/?$/.exec(url);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function isConnectMember(member: ChildWrapper): boolean {
  return member.host === "connect";
}
function isReactorFactMember(member: ChildWrapper): boolean {
  return member.host === "switchboard";
}

/** A connect member's configured `drives.defaultDrives` entries (config is
 * runner-defined, so the shape is checked here). */
function configuredDefaultDrives(
  config: Record<string, unknown> | undefined,
): PHConnectDefaultDrive[] | undefined {
  const drives = config?.drives;
  if (!isRecord(drives) || !Array.isArray(drives.defaultDrives)) {
    return undefined;
  }
  return drives.defaultDrives.filter(
    (d: unknown): d is PHConnectDefaultDrive =>
      isRecord(d) && (typeof d.url === "string" || d.local === true),
  );
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
  const parsed = genericCompoundHostSchema.safeParse(hostInput);
  if (!parsed.success) {
    throw new Error(
      `hosts/${hostInput.name}: invalid compound host:\n${z.prettifyError(parsed.error)}`,
    );
  }
  const host = parsed.data;
  const projectRoot = ctx.projectRoot;
  const wiring: CompoundWiring = host.config ?? {};
  // Resolved by the calling runner module: its `run` maps to defaultVerb.
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
  const createdDriveUrls: (string | null | undefined)[] = [];
  const declaredMembers = Object.keys(host.children);

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

  try {
    for (const [name, member] of orderedMembers(host.children, wiring)) {
      // A connect member gets the reactor member's created drives.
      let configPatch: Record<string, unknown> | undefined;
      if (
        isConnectMember(member) &&
        wiring.projectDrivesIntoConnect &&
        createdDriveUrls.length > 0
      ) {
        configPatch = projectDrivesIntoConnect({
          createdDriveUrls,
          configuredDefaultDrives: configuredDefaultDrives(member.config),
          publicBase: wiring.drivesPublicBase,
        });
      }

      const memberHost = resolveDriveReferences(
        await resolveMemberHost(projectRoot, member, userData, configPatch),
        name,
        started,
        declaredMembers,
      );
      if (isConnectMember(member) && wiring.cspRegistrySync) {
        memberHost.runner = { ...memberHost.runner, cspRegistrySync: true };
      }
      const specifier = memberHost.runner.module;
      const runner = await resolveRunnerModule(projectRoot, specifier);
      const file = `hosts/${member.host}/host.js`;
      const validated = validateHost(runner, specifier, memberHost, file);
      const memberVerb = memberVerbOf(verb, memberHost.runner);
      const fn = getVerb(runner, specifier, memberVerb);
      const handle = toStartedHandle(
        await fn(validated, {
          projectRoot,
          env: ctx.env,
          verb: memberVerb,
          parent: { host: host.name, verb },
        }),
        `${name} (${specifier} ${memberVerb})`,
      );
      // Registered before `ready` settles, so a failed start still tears
      // this member down.
      started.push({
        name,
        member,
        specifier,
        kind: runner.kind,
        verb: memberVerb,
        handle,
      });
      if (handle.ready) await handle.ready;

      if (isReactorFactMember(member) && handle.driveUrls) {
        createdDriveUrls.push(...handle.driveUrls);
      }
    }
  } catch (error) {
    await shutdown();
    throw error;
  }

  if (wiring.runtimeRecord !== false) {
    const members: Record<string, RunRecordMember> = {};
    for (const m of started) {
      members[m.name] = {
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
      members,
      ...(options.recordExtra ? { extra: options.recordExtra } : {}),
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
