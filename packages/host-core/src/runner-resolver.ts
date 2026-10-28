import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runnerKindSchema, type RunnerKind } from "./host-schemas.js";
import {
  checkOutputPaths,
  checkTokenSites,
  type DeclaredIssue,
  type OutputRef,
  type OutputsSchemaLookup,
} from "./resolve/declared.js";
import { findRemovedForms } from "./resolve/removed-forms.js";
import { describeMapElements } from "./resolve/resolve.js";
import { formatPath, unwrapEscapes } from "./resolve/walk.js";
import { findToken, tokenKeyOf, type TokenMode } from "./tokens.js";

/**
 * Resolves a host's `runner.module` specifier from the PROJECT's dependency
 * tree (not ph-cli's), imports it, and checks the runner-module contract:
 * `{ run, hostSchema, kind, outputsSchema?, verbs?, ...optionalVerbs }`.
 */

export class RunnerError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}\n  Hint: ${hint}` : message);
    this.name = "RunnerError";
  }
}

export interface RunnerContext {
  projectRoot: string;
  /** The verb this runner runs at. For a compound member it is the member's
   * OWN effective verb (e.g. "serve" under a compound at "run"). */
  verb: string;
  env: Record<string, string | undefined>;
  /** Set when this runner runs as a compound member: the compound's host
   * name and verb. */
  parent?: { host: string; verb: string };
}

/** A verb receives the PARSED host (its runner's hostSchema output), so
 * schema defaults and transforms reach it. */
export type RunnerVerb<O = unknown> = (
  host: O,
  ctx: RunnerContext,
) => Promise<unknown>;

export interface HostSchemaIssue {
  path: PropertyKey[];
  message: string;
  code?: string;
}

/** zod-shaped structurally, so a runner may bring its own zod instance. */
export interface HostSchemaLike<O = unknown> {
  safeParse(
    host: unknown,
  ):
    | { success: true; data: O }
    | { success: false; error: { issues: readonly HostSchemaIssue[] } };
}

/** Whether a value is zod-shaped (has a `safeParse` function): a runner's
 * `outputsSchema`, a plugin's config schema. */
export function isSchemaLike(value: unknown): value is HostSchemaLike {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
}

/** The Connect runner's specifier: compounds forward `cspRegistrySync` to
 * it, and `--explain` prints its dead-config warnings. */
export const CONNECT_RUNNER = "@powerhousedao/ph-cli/runners/connect";

export interface RunnerModule<O = unknown> {
  run: RunnerVerb<O>;
  /** The RESOLVED host schema: no tokens; checked right before the verb. */
  hostSchema: HostSchemaLike<O>;
  /** The DECLARED host schema (token-able fields accept tokens), from the
   * same definition (`defineHostSchemas`). Absent: declared validation
   * checks the tokens only, and shape errors surface at resolved
   * validation. */
  declaredHostSchema?: HostSchemaLike;
  kind: RunnerKind;
  /** What a started host produces (G3); `$output` paths are checked
   * against it. Absent: the runner produces no outputs. */
  outputsSchema?: unknown;
  /** The verb names, when the module exports functions that are not verbs
   * (helpers). Absent: every exported function is a verb. */
  verbs?: readonly string[];
  /** What the verb would refuse at boot, given the parsed host and an
   * environment (`ph host check`). Starts nothing. */
  checkBoot?: (
    host: O,
    ctx: BootCheckContext,
  ) => readonly BootIssue[] | Promise<readonly BootIssue[]>;
  [key: string]: unknown;
}

export interface BootCheckContext {
  projectRoot: string;
  /** The verb the host would run at (a compound member's own verb). */
  verb: string;
  /** The environment the verb would see; never `process.env` implicitly. */
  env: Readonly<Record<string, string | undefined>>;
  /** The host file, for messages (`hosts/switchboard/host.js`). */
  file: string;
}

export interface BootIssue {
  path?: string;
  message: string;
  hint?: string;
}

/** Exports that are part of the contract but are not verbs. */
const NON_VERB_EXPORTS = new Set([
  "hostSchema",
  "declaredHostSchema",
  "outputsSchema",
  "verbs",
  "kind",
  "checkBoot",
  "default",
]);

export async function resolveRunnerModule(
  projectRoot: string,
  specifier: string,
): Promise<RunnerModule> {
  const projectRequire = createRequire(
    pathToFileURL(path.join(projectRoot, "package.json")).href,
  );
  let resolved: string;
  try {
    resolved = projectRequire.resolve(specifier);
  } catch {
    throw new RunnerError(
      `Cannot resolve runner module "${specifier}" from ${projectRoot}.`,
      "The runner must be a dependency of the project (install it, then retry).",
    );
  }

  const module = (await import(pathToFileURL(resolved).href)) as Record<
    string,
    unknown
  >;

  if (typeof module.run !== "function") {
    throw new RunnerError(
      `Runner "${specifier}" does not export a \`run\` function (required verb).`,
    );
  }
  const hostSchema = module.hostSchema as HostSchemaLike | undefined;
  if (!hostSchema || typeof hostSchema.safeParse !== "function") {
    throw new RunnerError(
      `Runner "${specifier}" does not export a \`hostSchema\` — runners validate their own host shape.`,
    );
  }
  const declared = module.declaredHostSchema as HostSchemaLike | undefined;
  if (declared !== undefined && typeof declared.safeParse !== "function") {
    throw new RunnerError(
      `Runner "${specifier}" exports a \`declaredHostSchema\` without safeParse.`,
    );
  }
  if (
    module.checkBoot !== undefined &&
    typeof module.checkBoot !== "function"
  ) {
    throw new RunnerError(
      `Runner "${specifier}" exports a \`checkBoot\` that is not a function.`,
    );
  }
  const verbs = module.verbs;
  if (
    verbs !== undefined &&
    (!Array.isArray(verbs) ||
      !verbs.every(
        (verb: unknown) =>
          typeof verb === "string" && typeof module[verb] === "function",
      ))
  ) {
    throw new RunnerError(
      `Runner "${specifier}" exports \`verbs\` ${JSON.stringify(verbs)}, which must list names of exported functions.`,
    );
  }
  if (!runnerKindSchema.safeParse(module.kind).success) {
    throw new RunnerError(
      `Runner "${specifier}" does not export a valid \`kind\` (got ${JSON.stringify(module.kind)}; expected "reactor" | "compound").`,
    );
  }
  return module as unknown as RunnerModule;
}

/** Verbs that produce something and start nothing (`build`): no outputs, no
 * record, no lock — and no token resolution, since what they read (output
 * dirs, packages) never comes from another host's outputs. Their verb gets
 * the declared host (tokens may remain in token-able fields). */
export const ONE_SHOT_VERBS: ReadonlySet<string> = new Set(["build"]);

export function listVerbs<O>(runner: RunnerModule<O>): string[] {
  if (runner.verbs) {
    return runner.verbs
      .filter((name) => typeof runner[name] === "function")
      .toSorted();
  }
  return Object.entries(runner)
    .filter(
      ([name, value]) =>
        typeof value === "function" && !NON_VERB_EXPORTS.has(name),
    )
    .map(([name]) => name)
    .sort();
}

export function getVerb<O>(
  runner: RunnerModule<O>,
  specifier: string,
  verb: string,
): RunnerVerb<O> {
  const candidate = runner[verb];
  if (typeof candidate !== "function" || !listVerbs(runner).includes(verb)) {
    throw new RunnerError(
      `Runner "${specifier}" does not support the verb "${verb}". Supported verbs: ${listVerbs(
        runner,
      ).join(", ")}.`,
    );
  }
  return candidate as RunnerVerb<O>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A contract violation found while validating a host, without the file
 * prefix the throwing validators add. */
export interface RunnerIssue {
  path: string;
  message: string;
  hint?: string;
}

/** reactor XOR children, decided by the runner's declared `kind`. */
export function kindShapeIssues(
  kind: RunnerKind,
  specifier: string,
  host: Record<string, unknown>,
): RunnerIssue[] {
  if (kind === "reactor" && host.children !== undefined) {
    return [
      {
        path: "children",
        message: `"${specifier}" is a reactor runner, so the host must not declare \`children\`.`,
        hint: "`children` belongs to compound hosts; a reactor host configures its own `reactor` block.",
      },
    ];
  }
  if (kind === "compound" && host.reactor !== undefined) {
    return [
      {
        path: "reactor",
        message: `"${specifier}" is a compound runner, so the host must not declare \`reactor\`.`,
        hint: "A compound's reactors are its members': configure them in the member host or a wrapper's `reactor` override.",
      },
    ];
  }
  return [];
}

function assertKindShape(
  kind: RunnerKind,
  specifier: string,
  host: Record<string, unknown>,
  file: string,
): void {
  const issue = kindShapeIssues(kind, specifier, host).at(0);
  if (issue) throw new RunnerError(`${file}: ${issue.message}`, issue.hint);
}

/** `runner.defaultVerb` and every plugin entry's `verbs` must name verbs
 * this runner exports. */
export function knownVerbIssues<O>(
  runner: RunnerModule<O>,
  specifier: string,
  host: Record<string, unknown>,
): RunnerIssue[] {
  const options = host.runner;
  if (!isRecord(options)) return [];
  const verbs = listVerbs(runner);
  const unknownVerb = (verb: unknown): verb is string =>
    typeof verb === "string" && !verbs.includes(verb);
  const issues: RunnerIssue[] = [];
  if (unknownVerb(options.defaultVerb)) {
    issues.push({
      path: "runner.defaultVerb",
      message: `runner.defaultVerb "${options.defaultVerb}" is not a verb of "${specifier}". Supported verbs: ${verbs.join(", ")}.`,
    });
  }
  const plugins: unknown[] = Array.isArray(options.plugins)
    ? options.plugins
    : [];
  plugins.forEach((entry, index) => {
    if (!isRecord(entry) || !Array.isArray(entry.verbs)) return;
    const scoped: unknown[] = entry.verbs;
    for (const bad of scoped.filter(unknownVerb)) {
      issues.push({
        path: `runner.plugins[${index}].verbs`,
        message: `plugin "${String(entry.module)}" is scoped to verb "${bad}", which "${specifier}" does not export. Supported verbs: ${verbs.join(", ")}.`,
      });
    }
  });
  return issues;
}

function formatIssues(issues: readonly DeclaredIssue[]): string {
  return issues.map((i) => `  - ${i.path}: ${i.message}`).join("\n");
}

function valueAt(host: unknown, path: readonly PropertyKey[]): unknown {
  let current = host;
  for (const key of path) {
    if (Array.isArray(current) && typeof key === "number") {
      current = current[key];
    } else if (isRecord(current) && typeof key === "string") {
      current = current[key];
    } else {
      return undefined;
    }
  }
  return current;
}

export interface ValidateHostOptions {
  /** "forbid" (default): the resolved form, checked with `hostSchema`; no
   * token may remain. "allow": the declared form, checked with
   * `declaredHostSchema` (else `hostSchema`) — what a COMPOUND runner's verb
   * receives, since its members resolve their own tokens. */
  tokens?: TokenMode;
}

/**
 * Resolved validation (pipeline step 6): validate a RESOLVED host against
 * its runner's `hostSchema` and return the PARSED host (what the verb
 * receives). Run `resolveHostOutputs` first; a token still present fails
 * with its path.
 */
export function validateHost<O>(
  runner: RunnerModule<O>,
  specifier: string,
  host: unknown,
  file: string,
  options: ValidateHostOptions = {},
): O {
  const schema =
    options.tokens === "allow"
      ? (runner.declaredHostSchema ?? runner.hostSchema)
      : runner.hostSchema;
  // Same definition (defineHostSchemas), so the declared parse has the
  // verb's shape; only token-able fields may still hold tokens.
  return parseHost(
    runner,
    schema as HostSchemaLike<O>,
    specifier,
    host,
    file,
    options,
  );
}

export interface SchemaIssue extends RunnerIssue {
  /** The line `validateHost` prints: zod's dotted path (other runners' tests
   * match on it), then the message. */
  printed: string;
}

export interface HostSchemaIssues<O> {
  /** Kind shape, an unresolved token (forbid mode) and unknown verbs, in
   * the order the throwing validator checks them. */
  issues: RunnerIssue[];
  /** The schema's own issues; absent when the host parsed. */
  schemaIssues?: SchemaIssue[];
  data?: O;
}

/** What `validateHost` checks, as data: nothing throws. */
export function hostSchemaIssues<O>(
  runner: RunnerModule<O>,
  schema: HostSchemaLike<O>,
  specifier: string,
  host: unknown,
  options: ValidateHostOptions = {},
): HostSchemaIssues<O> {
  const issues: RunnerIssue[] = [];
  if (isRecord(host)) {
    issues.push(...kindShapeIssues(runner.kind, specifier, host));
    if (options.tokens !== "allow") {
      const token = findToken(host);
      if (token) {
        issues.push({
          path: token.path,
          message: `\`${token.path}\` is an unresolved output token (${token.key}).`,
          hint: "Resolve the host (resolveHostOutputs) before validating it for a verb; `ph run` does this.",
        });
      }
    }
    issues.push(...knownVerbIssues(runner, specifier, host));
  }
  // `$$` escapes protect literal `$`-keyed objects through the token walk;
  // the schema (and the verb) see the literal.
  const result = schema.safeParse(unwrapEscapes(host));
  if (result.success) return { issues, data: result.data };
  const schemaIssues = result.error.issues.map((issue): SchemaIssue => {
    const element = describeMapElements(host, issue.path);
    const dotted =
      (issue.path.map(String).join(".") || "<root>") +
      (element ? ` (${element})` : "");
    // A token in a field that does not take one: say so, rather than
    // the field type's own "expected string". A refinement's own message
    // about a token stands.
    const message =
      issue.code !== "custom" && tokenKeyOf(valueAt(host, issue.path))
        ? "this field does not take an output token (it is not token-able); spell the value literally."
        : issue.message;
    return {
      path: formatPath(
        issue.path.filter(
          (key): key is string | number =>
            typeof key === "string" || typeof key === "number",
        ),
      ),
      message: element ? `${message} (${element})` : message,
      printed: `${dotted}: ${message}`,
    };
  });
  return { issues, schemaIssues };
}

function parseHost<O>(
  runner: RunnerModule<O>,
  schema: HostSchemaLike<O>,
  specifier: string,
  host: unknown,
  file: string,
  options: ValidateHostOptions,
): O {
  const checked = hostSchemaIssues(runner, schema, specifier, host, options);
  const first = checked.issues.at(0);
  if (first) throw new RunnerError(`${file}: ${first.message}`, first.hint);
  if (checked.schemaIssues) {
    const issues = checked.schemaIssues
      .map((issue) => `  - ${issue.printed}`)
      .join("\n");
    throw new RunnerError(
      `${file} failed validation against the hostSchema of "${specifier}":\n${issues || "  (no details reported)"}`,
    );
  }
  return checked.data as O;
}

export interface DeclaredHostOptions {
  /** Producer lookup for `$output` path checks. Absent: paths are not
   * checked here (a compound checks its members' tokens per member). */
  outputsSchemaOf?: (ref: OutputRef) => OutputsSchemaLookup;
}

/**
 * Declared validation (pipeline step 3): the removed cross-host forms
 * (each error names its token form), token shapes and `$env` `optional`
 * placement, `$output` paths against the producers' `outputsSchema`s, then
 * the runner's `declaredHostSchema` (tokens allowed in token-able fields).
 * Reads no environment value and needs no producer running. Throws on the
 * first failing stage; resolve, then `validateHost`, before a verb runs.
 */
export function validateDeclaredHost(
  runner: RunnerModule,
  specifier: string,
  host: unknown,
  file: string,
  options: DeclaredHostOptions = {},
): void {
  const removed = findRemovedForms(host);
  if (removed.length > 0) {
    throw new RunnerError(`${file}: removed form:\n${formatIssues(removed)}`);
  }
  const issues = checkTokenSites(host);
  if (options.outputsSchemaOf) {
    issues.push(...checkOutputPaths(host, options.outputsSchemaOf));
  }
  if (issues.length > 0) {
    throw new RunnerError(
      `${file}: invalid output token:\n${formatIssues(issues)}`,
    );
  }
  if (isRecord(host)) assertKindShape(runner.kind, specifier, host, file);
  if (!runner.declaredHostSchema) return;
  parseHost(runner, runner.declaredHostSchema, specifier, host, file, {
    tokens: "allow",
  });
}
