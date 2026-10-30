import {
  compoundStartVerb,
  memberVerbOf,
  prepareMember,
  takesCspRegistrySync,
  type PreparedMember,
} from "./compound.js";
import { isBuiltinEnvName, substituteBuiltinEnv } from "./env-substitution.js";
import { loadHost } from "./host-loader.js";
import type { CheckStage, HostIssue } from "./host-issues.js";
import type { ChildWrapper, CompoundWiring } from "./host-schemas.js";
import {
  checkOutputPaths,
  checkTokenSites,
  envSitesOf,
  outputRefsOf,
  outputSitesOf,
  type OutputRef,
  type OutputsSchemaLookup,
} from "./resolve/declared.js";
import {
  loadProducers,
  processResolveEnv,
  producerOutputsSchemas,
  runnerOutputsSchema,
} from "./resolve/node.js";
import { memberForRef, planCompound } from "./resolve/plan.js";
import { findRemovedForms } from "./resolve/removed-forms.js";
import {
  resolveHostOutputs,
  TokenResolutionError,
  unsetEnvMessage,
  type DeferredToken,
  type OutputSource,
  type SelfMembers,
} from "./resolve/resolve.js";
import { isPlainObject } from "./resolve/walk.js";
import {
  CONNECT_RUNNER,
  getVerb,
  hostSchemaIssues,
  kindShapeIssues,
  ONE_SHOT_VERBS,
  resolveRunnerModule,
  type HostSchemaLike,
  type RunnerIssue,
  type RunnerModule,
} from "./runner-resolver.js";

export interface CheckHostOptions {
  projectRoot: string;
  /** The environment `ph run` would resolve against; `process.env` is never read. */
  env: Readonly<Record<string, string | undefined>>;
  /** Default `run`, as `ph run <name>`. */
  verb?: string;
  /** Producers' outputs. Absent: `$output` tokens are checked declared-only. */
  outputs?: OutputSource;
}

export interface CheckDeferred extends DeferredToken {
  file: string;
}

export interface CheckHostResult {
  issues: HostIssue[];
  /** What `ph run` survives but the user should know; never fails a check. */
  warnings: HostIssue[];
  /** `$output` tokens left unresolved because no `outputs` were given. */
  deferred: CheckDeferred[];
}

/** The `ph run` pipeline up to the verb, collecting every issue; starts nothing. */
export async function checkHost(
  name: string,
  options: CheckHostOptions,
): Promise<CheckHostResult> {
  const result: CheckHostResult = { issues: [], warnings: [], deferred: [] };
  const file = `hosts/${name}/host.js`;
  const issue = issuer(result, file);
  const verb = options.verb ?? "run";
  let host: Record<string, unknown> & { runner: { module: string } };
  let runner: RunnerModule;
  try {
    host = (await loadHost(options.projectRoot, name)).host;
    runner = await resolveRunnerModule(options.projectRoot, host.runner.module);
  } catch (error) {
    issue("load", "", error);
    return result;
  }
  const specifier = host.runner.module;

  if (runner.kind === "compound") {
    await checkCompound(result, options, {
      file,
      host,
      runner,
      specifier,
      verb,
    });
    return result;
  }

  const refs = outputRefsOf(host);
  const producers = await loadProducers(options.projectRoot, refs);
  await checkSubject(result, options, {
    file,
    host,
    runner,
    specifier,
    verb,
    outputsSchemaOf: producerOutputsSchemas(producers),
    self: "outputs",
  });
  return result;
}

interface Subject {
  file: string;
  host: Record<string, unknown>;
  runner: RunnerModule;
  specifier: string;
  verb: string;
}

interface ReactorSubject extends Subject {
  outputsSchemaOf: (ref: OutputRef) => OutputsSchemaLookup;
  /** Whose `$output` tokens stay in place when no outputs are given. */
  self: SelfMembers | "outputs";
  /** A compound member's wiring, applied before resolved validation. */
  patch?: (host: Record<string, unknown>) => Record<string, unknown>;
}

/** Declared validation; returns whether its tokens and its shape passed. */
function checkDeclared(
  result: CheckHostResult,
  subject: Subject,
  outputsSchemaOf?: (ref: OutputRef) => OutputsSchemaLookup,
): { tokens: boolean; shape: boolean } {
  const issue = issuer(result, subject.file);
  const { host, runner, specifier } = subject;
  try {
    getVerb(runner, specifier, subject.verb);
  } catch (error) {
    issue("declared", "", error);
  }
  const tokenIssues = [
    ...findRemovedForms(host),
    ...checkTokenSites(host),
    ...(outputsSchemaOf ? checkOutputPaths(host, outputsSchemaOf) : []),
  ];
  for (const i of tokenIssues) issue("declared", i);
  const shapeIssues = runner.declaredHostSchema
    ? schemaIssuesOf(runner, runner.declaredHostSchema, specifier, host, true)
    : kindShapeIssues(runner.kind, specifier, host);
  for (const i of shapeIssues) issue("declared", i);
  return { tokens: tokenIssues.length === 0, shape: shapeIssues.length === 0 };
}

function schemaIssuesOf(
  runner: RunnerModule,
  schema: HostSchemaLike,
  specifier: string,
  host: unknown,
  allowTokens: boolean,
): RunnerIssue[] {
  const checked = hostSchemaIssues(runner, schema, specifier, host, {
    tokens: allowTokens ? "allow" : "forbid",
  });
  return [...checked.issues, ...(checked.schemaIssues ?? [])];
}

async function checkSubject(
  result: CheckHostResult,
  options: CheckHostOptions,
  subject: ReactorSubject,
): Promise<void> {
  const issue = issuer(result, subject.file);
  const { runner, specifier, file } = subject;
  const declared = checkDeclared(result, subject, subject.outputsSchemaOf);
  const resolveEnv = processResolveEnv(options.projectRoot, options.env);
  const patch = subject.patch ?? ((host) => host);

  // A one-shot verb (build) resolves nothing; its verb gets the declared host.
  if (ONE_SHOT_VERBS.has(subject.verb)) {
    if (!declared.tokens || !declared.shape) return;
    const host = patch(
      substituteBuiltinEnv(subject.host, resolveEnv.builtins ?? {}),
    );
    const schema = runner.declaredHostSchema ?? runner.hostSchema;
    for (const i of schemaIssuesOf(runner, schema, specifier, host, true)) {
      issue("resolved", i);
    }
    return;
  }

  const unset = envSitesOf(subject.host).filter(
    (site) =>
      !site.optional &&
      !isBuiltinEnvName(site.name) &&
      options.env[site.name] === undefined,
  );
  for (const site of unset) {
    issue("resolve", { path: site.path, message: unsetEnvMessage(site.name) });
  }
  if (!declared.tokens || unset.length > 0) return;

  let resolved: Record<string, unknown>;
  let deferred: DeferredToken[] = [];
  try {
    if (options.outputs) {
      resolved = resolveHostOutputs(subject.host, {
        outputs: options.outputs,
        ...resolveEnv,
      });
    } else {
      const partial = resolveHostOutputs(subject.host, resolveEnv, {
        deferSelf: subject.self,
      });
      resolved = partial.host;
      deferred = partial.deferred;
    }
  } catch (error) {
    if (error instanceof TokenResolutionError && error.detail) {
      issue("resolve", {
        path: error.detail.path,
        message: error.detail.reason,
      });
    } else {
      issue("resolve", "", error);
    }
    return;
  }
  result.deferred.push(...deferred.map((d) => ({ ...d, file })));
  if (!declared.shape) return;

  const allow = deferred.length > 0;
  const schema = allow
    ? (runner.declaredHostSchema ?? runner.hostSchema)
    : runner.hostSchema;
  const checked = hostSchemaIssues(runner, schema, specifier, patch(resolved), {
    tokens: allow ? "allow" : "forbid",
  });
  const resolvedIssues = [...checked.issues, ...(checked.schemaIssues ?? [])];
  for (const i of resolvedIssues) issue("resolved", i);
  if (resolvedIssues.length > 0 || !runner.checkBoot) return;

  try {
    const boot = await runner.checkBoot(checked.data, {
      projectRoot: options.projectRoot,
      verb: subject.verb,
      env: options.env,
      file,
    });
    for (const i of boot) issue("boot", { ...i, path: i.path ?? "" });
  } catch (error) {
    issue("boot", "", error);
  }
}

async function checkCompound(
  result: CheckHostResult,
  options: CheckHostOptions,
  subject: Subject,
): Promise<void> {
  const issue = issuer(result, subject.file);
  const { host, runner, specifier } = subject;
  const declared = checkDeclared(result, subject);
  if (!declared.tokens || !declared.shape) return;
  // Without a declared schema, checkDeclared checked the kind shape only.
  if (!runner.declaredHostSchema) {
    const own = schemaIssuesOf(
      runner,
      runner.hostSchema,
      specifier,
      host,
      true,
    );
    for (const i of own) issue("resolved", i);
    if (own.length > 0) return;
  }

  const children = (
    isPlainObject(host.children) ? host.children : {}
  ) as Record<string, ChildWrapper>;
  const wiring = (
    isPlainObject(host.config) ? host.config : {}
  ) as CompoundWiring;
  // The generic compound's mapping; a runner with its own (desktop's
  // `serve`) is checked as if it were generic.
  const verb = compoundStartVerb(
    subject.verb,
    host.runner as { defaultVerb?: string },
  );

  const prepared: PreparedMember[] = [];
  for (const [key, member] of Object.entries(children)) {
    try {
      prepared.push(await prepareMember(options.projectRoot, key, member));
    } catch (error) {
      issuer(result, `hosts/${member.host}/host.js`)("load", "", error);
    }
  }
  const members = Object.entries(children).map(([key, m]) => ({
    key,
    host: m.host,
  }));
  if (prepared.length === members.length) {
    try {
      planCompound(
        prepared.map((m) => ({
          key: m.key,
          host: m.member.host,
          refs: outputSitesOf(m.draft).map(({ ref, path }) => ({
            ref,
            path,
          })),
        })),
        wiring.startOrder,
      );
    } catch (error) {
      issue("declared", "", error);
    }
  }

  result.warnings.push(...sharedPortWarnings(subject.file, prepared));

  const byKey = new Map(prepared.map((m) => [m.key, m]));
  const outputsSchemaOf = (ref: OutputRef): OutputsSchemaLookup => {
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
  };
  for (const m of prepared) {
    const csp = wiring.cspRegistrySync === true && takesCspRegistrySync(m);
    await checkSubject(result, options, {
      file: m.file,
      host: m.draft,
      runner: m.runner,
      specifier: m.specifier,
      verb: memberVerbOf(verb, m.draft.runner),
      outputsSchemaOf,
      self: { members },
      ...(csp
        ? {
            patch: (resolved) => ({
              ...resolved,
              runner: { ...(resolved.runner as object), cspRegistrySync: true },
            }),
          }
        : {}),
    });
  }
}

/** Members declaring one port: under `ph run` the later one moves or fails. */
function sharedPortWarnings(
  file: string,
  prepared: readonly PreparedMember[],
): HostIssue[] {
  const owners = new Map<number, PreparedMember>();
  const warnings: HostIssue[] = [];
  for (const m of prepared) {
    const port = (m.draft.runner as { port?: unknown }).port;
    if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
      continue;
    }
    const other = owners.get(port);
    if (!other) {
      owners.set(port, m);
      continue;
    }
    const connects =
      m.specifier === CONNECT_RUNNER && other.specifier === CONNECT_RUNNER;
    warnings.push({
      stage: "declared",
      file,
      path: `children.${m.key}.runner.port`,
      message: connects
        ? `${other.key} and ${m.key} both use port ${port}. One will move to the next free port and lose its browser data.`
        : `${other.key} and ${m.key} both use port ${port}. One will move to the next free port or fail to start.`,
    });
  }
  return warnings;
}

function issuer(result: CheckHostResult, file: string) {
  return (
    stage: CheckStage,
    found: RunnerIssue | string,
    error?: unknown,
  ): void => {
    if (typeof found !== "string") {
      const { path, message, hint } = found;
      result.issues.push({
        stage,
        file,
        path,
        message,
        ...(hint ? { hint } : {}),
      });
      return;
    }
    const text = error instanceof Error ? error.message : String(error);
    const [message, hint] = text.split("\n  Hint: ");
    result.issues.push({
      stage,
      file,
      path: found,
      message,
      ...(hint ? { hint } : {}),
    });
  };
}
