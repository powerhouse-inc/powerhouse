import {
  backendToDescriptor,
  isStructuralMultiReactor,
} from "./backend-projection.js";
import type {
  ReactorBackend,
  ReactorBackendKind,
  ReactorConfig,
  ReactorStorageConfig,
  RunnerKind,
} from "./host-schemas.js";
import { reactorClientMode, type ReactorClientMode } from "./reactor-config.js";
import { envSitesOf, outputSitesOf, refKey } from "./resolve/declared.js";
import type { CompoundPlan } from "./resolve/plan.js";
import type { OutputPath } from "./tokens.js";

/**
 * What a host amounts to once its pipeline has run (typed-host-configs G2,
 * 2.2): the reactor-client shape its backends select, the drives it serves
 * or attaches, the producers whose outputs it consumes and, for a compound,
 * the start order and each member's expectation. Pure and platform-neutral:
 * the caller runs load → declared validation → resolve → resolved
 * validation (and plugin contribution discovery) and hands over the
 * results. The returned value is JSON-only, so it can be pinned in a test
 * table or shipped to another process (a future reactor-monitor).
 */

/** One backend, in placement-primary-first order. */
export interface ExpectedBackend {
  name: string;
  kind: ReactorBackendKind;
  storage?: ReactorStorageConfig["kind"];
  /** The RESOLVED storage dir (`"${userData}"` sugar and `$env` applied). */
  dataDir?: string;
  /** Why a provisioned reactor (a browser tab, reactor-monitor) cannot be
   * built from this backend (`backendToDescriptor`): e.g. postgres storage
   * is server-side only, a remote backend needs `remote.url`. Absent when
   * it can. A switchboard's own backend may legitimately carry one. */
  provisionError?: string;
}

/** One drive of the merged plan: plugin contributions first, then the
 * host's own declarations (the host wins a slug). Identity is the DECLARED
 * slug: a `projectHash` drive reports the flag, not a hashed id, so the
 * expectation does not depend on where the project lives. */
export interface ExpectedDrive {
  slug: string;
  kind: "local" | "remote";
  /** "host" for `reactor.drives`; the plugin name for a contribution. */
  source: string;
  /** A remote drive's resolved URL. */
  url?: string;
  id?: string;
  projectHash?: boolean | "id";
}

/** One `$output` token in the declared host. */
export interface ConsumedOutput {
  /** Host path of the token (`reactor.backends.sb.remote.url`). */
  at: string;
  host: string;
  member?: string;
  path: OutputPath;
}

export interface HostExpectation {
  name: string;
  kind: RunnerKind;
  /** The verb this host runs at: `runner.defaultVerb ?? "run"` standalone;
   * for a compound member, its own effective verb under the compound's. */
  verb: string;
  /** Reactor hosts with backends: `reactorClientMode`. */
  clientMode?: ReactorClientMode;
  /** Reactor hosts: local AND remote backends (Connect's routing client). */
  multiReactor?: boolean;
  backends?: ExpectedBackend[];
  /** The resolved URLs of the remote backends, placement order. */
  remotes?: string[];
  drives?: ExpectedDrive[];
  /** Producers its own tokens read (`host` or `host#member`), sorted. */
  dependsOn: string[];
  consumes: ConsumedOutput[];
  /** `$env` names its own tokens read, sorted (values are not recorded). */
  env: string[];
  /** Compound: member keys in start order. */
  startOrder?: string[];
  /** Compound: each member's expectation. */
  members?: Record<string, MemberExpectation>;
}

export interface MemberExpectation extends Omit<
  HostExpectation,
  "startOrder" | "members"
> {
  /** The member's host folder (`children.<key>.host`). */
  host: string;
  /** Member keys this member consumes (it starts after them), sorted. */
  after: string[];
}

/** A drive a plugin contributes, as plugin contribution discovery reports
 * it (`resolvePluginContributions`). */
export interface ContributedDriveInput {
  declaration: Record<string, unknown>;
  source: string;
}

export interface ExpectHostInput {
  kind: RunnerKind;
  /** The host as declared (tokens in place); a compound member's draft
   * (its host.js with the wrapper applied). */
  declared: Record<string, unknown>;
  /** The resolved (and parsed) host. Default: `declared`. */
  resolved?: Record<string, unknown>;
  /** Drives the host's plugins contribute at its verb. */
  contributed?: readonly ContributedDriveInput[];
  /** Compound: its members, any order (the plan orders them). */
  members?: readonly MemberInput[];
  /** Compound: the dependency plan (`planCompound`). */
  plan?: CompoundPlan;
}

export interface MemberInput extends Omit<ExpectHostInput, "members" | "plan"> {
  key: string;
  host: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runnerOf(host: Record<string, unknown>): Record<string, unknown> {
  return isRecord(host.runner) ? host.runner : {};
}

function defaultVerbOf(host: Record<string, unknown>): string | undefined {
  const verb = runnerOf(host).defaultVerb;
  return typeof verb === "string" ? verb : undefined;
}

/** At compound verb "run" each member runs its own defaultVerb; any other
 * compound verb is forwarded uniformly (compound.ts `memberVerbOf`). */
function memberVerb(compoundVerb: string, member: Record<string, unknown>) {
  return compoundVerb === "run"
    ? (defaultVerbOf(member) ?? "run")
    : compoundVerb;
}

/** Backend names, placement-primary first (`backendsToDescriptors` order). */
function orderedBackends(reactor: ReactorConfig): [string, ReactorBackend][] {
  const backends = Object.entries(reactor.backends ?? {});
  const primary = reactor.placement?.primary;
  const first = backends.filter(([name]) => name === primary);
  return [...first, ...backends.filter(([name]) => name !== primary)];
}

function expectBackend(
  name: string,
  backend: ReactorBackend,
  reactor: ReactorConfig,
): ExpectedBackend {
  const out: ExpectedBackend = { name, kind: backend.kind };
  if (backend.storage) out.storage = backend.storage.kind;
  if (typeof backend.storage?.dataDir === "string") {
    out.dataDir = backend.storage.dataDir;
  }
  try {
    backendToDescriptor(name, backend, reactor.protocol);
  } catch (error) {
    out.provisionError = error instanceof Error ? error.message : String(error);
  }
  return out;
}

function expectDrive(
  declaration: Record<string, unknown>,
  source: string,
): ExpectedDrive | undefined {
  if (typeof declaration.slug !== "string") return undefined;
  const remote = isRecord(declaration.remote) ? declaration.remote : undefined;
  const drive: ExpectedDrive = {
    slug: declaration.slug,
    kind: remote ? "remote" : "local",
    source,
  };
  if (remote && typeof remote.url === "string") drive.url = remote.url;
  if (typeof declaration.id === "string") drive.id = declaration.id;
  const projectHash = declaration.projectHash;
  if (typeof projectHash === "boolean" || projectHash === "id") {
    drive.projectHash = projectHash;
  }
  return drive;
}

/** The key `mergeDrivePlan` merges on: the SERVED slug, which for
 * `projectHash: true` is the hashed id (never equal to a plain slug). */
function servedSlugKey(drive: ExpectedDrive): string {
  return drive.projectHash === true ? `${drive.slug}\0hashed` : drive.slug;
}

/** Contributions first, then host declarations; keyed by served slug, the
 * host wins (and keeps the contribution's position), like `mergeDrivePlan`. */
function drivePlan(
  reactor: ReactorConfig | undefined,
  contributed: readonly ContributedDriveInput[],
): ExpectedDrive[] {
  const plan = new Map<string, ExpectedDrive>();
  for (const { declaration, source } of contributed) {
    const drive = expectDrive(declaration, source);
    if (drive) plan.set(servedSlugKey(drive), drive);
  }
  for (const declaration of reactor?.drives ?? []) {
    const drive = expectDrive(declaration, "host");
    if (drive) plan.set(servedSlugKey(drive), drive);
  }
  return [...plan.values()];
}

/** Token facts of the host's OWN fields (a compound's `children` are its
 * members' own). */
function tokenFacts(
  declared: Record<string, unknown>,
  kind: RunnerKind,
): Pick<HostExpectation, "dependsOn" | "consumes" | "env"> {
  const own =
    kind === "compound"
      ? Object.fromEntries(
          Object.entries(declared).filter(([key]) => key !== "children"),
        )
      : declared;
  const sites = outputSitesOf(own);
  const consumes = sites.map(({ path, ref, outputPath }): ConsumedOutput => ({
    at: path,
    host: ref.host,
    ...(ref.member !== undefined ? { member: ref.member } : {}),
    path: outputPath,
  }));
  return {
    dependsOn: [...new Set(sites.map(({ ref }) => refKey(ref)))].sort(),
    consumes,
    env: [...new Set(envSitesOf(own).map(({ name }) => name))].sort(),
  };
}

function expectOwn(
  input: Omit<ExpectHostInput, "members" | "plan">,
  verb: string,
): HostExpectation {
  const resolved = input.resolved ?? input.declared;
  const expectation: HostExpectation = {
    name: typeof resolved.name === "string" ? resolved.name : "",
    kind: input.kind,
    verb,
    ...tokenFacts(input.declared, input.kind),
  };
  if (input.kind !== "reactor") return expectation;

  const reactor = isRecord(resolved.reactor)
    ? (resolved.reactor as ReactorConfig)
    : undefined;
  const mode = reactorClientMode(reactor);
  if (mode !== undefined) expectation.clientMode = mode;
  expectation.multiReactor = isStructuralMultiReactor(reactor);
  const backends = reactor ? orderedBackends(reactor) : [];
  if (reactor && backends.length > 0) {
    expectation.backends = backends.map(([name, backend]) =>
      expectBackend(name, backend, reactor),
    );
    expectation.remotes = backends.flatMap(([, backend]) =>
      backend.kind === "remote" && typeof backend.remote?.url === "string"
        ? [backend.remote.url]
        : [],
    );
  }
  expectation.drives = drivePlan(reactor, input.contributed ?? []);
  return expectation;
}

/**
 * The expectation for one host. A reactor host's comes from its resolved
 * reactor block and contributed drives; a compound's lists its members in
 * plan order, each with the verb it runs at under the compound's own verb
 * and the members it starts after.
 */
export function expectHost(input: ExpectHostInput): HostExpectation {
  const verb = defaultVerbOf(input.declared) ?? "run";
  const expectation = expectOwn(input, verb);
  if (input.kind !== "compound" || !input.members) return expectation;

  const order = input.plan?.order ?? input.members.map((m) => m.key);
  const edges = input.plan?.edges ?? [];
  const byKey = new Map(input.members.map((m) => [m.key, m]));
  const members: Record<string, MemberExpectation> = {};
  for (const key of order) {
    const member = byKey.get(key);
    if (!member) continue;
    members[key] = {
      host: member.host,
      ...expectOwn(member, memberVerb(verb, member.declared)),
      after: [
        ...new Set(
          edges.filter((e) => e.consumer === key).map((e) => e.producer),
        ),
      ].sort(),
    };
  }
  expectation.startOrder = order.filter((key) => byKey.has(key));
  expectation.members = members;
  return expectation;
}
