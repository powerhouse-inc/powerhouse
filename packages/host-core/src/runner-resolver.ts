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
import { unwrapEscapes } from "./resolve/walk.js";
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
}

/** zod-shaped structurally, so a runner may bring its own zod instance. */
export interface HostSchemaLike<O = unknown> {
  safeParse(
    host: unknown,
  ):
    | { success: true; data: O }
    | { success: false; error: { issues: readonly HostSchemaIssue[] } };
}

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
  [key: string]: unknown;
}

/** Exports that are part of the contract but are not verbs. */
const NON_VERB_EXPORTS = new Set([
  "hostSchema",
  "declaredHostSchema",
  "outputsSchema",
  "verbs",
  "kind",
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

/** reactor XOR children, decided by the runner's declared `kind`. */
function assertKindShape(
  kind: RunnerKind,
  specifier: string,
  host: Record<string, unknown>,
  file: string,
): void {
  if (kind === "reactor" && host.children !== undefined) {
    throw new RunnerError(
      `${file}: "${specifier}" is a reactor runner, so the host must not declare \`children\`.`,
      "`children` belongs to compound hosts; a reactor host configures its own `reactor` block.",
    );
  }
  if (kind === "compound" && host.reactor !== undefined) {
    throw new RunnerError(
      `${file}: "${specifier}" is a compound runner, so the host must not declare \`reactor\`.`,
      "A compound's reactors are its members': configure them in the member host or a wrapper's `reactor` override.",
    );
  }
}

/** `runner.defaultVerb` and every plugin entry's `verbs` must name verbs
 * this runner exports. */
function assertKnownVerbs<O>(
  runner: RunnerModule<O>,
  specifier: string,
  host: Record<string, unknown>,
  file: string,
): void {
  const options = host.runner;
  if (!isRecord(options)) return;
  const verbs = listVerbs(runner);
  const unknownVerb = (verb: unknown): verb is string =>
    typeof verb === "string" && !verbs.includes(verb);
  if (unknownVerb(options.defaultVerb)) {
    throw new RunnerError(
      `${file}: runner.defaultVerb "${options.defaultVerb}" is not a verb of "${specifier}". Supported verbs: ${verbs.join(", ")}.`,
    );
  }
  const plugins: unknown[] = Array.isArray(options.plugins)
    ? options.plugins
    : [];
  for (const entry of plugins) {
    if (!isRecord(entry) || !Array.isArray(entry.verbs)) continue;
    const scoped: unknown[] = entry.verbs;
    const bad = scoped.find(unknownVerb);
    if (bad !== undefined) {
      throw new RunnerError(
        `${file}: plugin "${String(entry.module)}" is scoped to verb "${bad}", which "${specifier}" does not export. Supported verbs: ${verbs.join(", ")}.`,
      );
    }
  }
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

function parseHost<O>(
  runner: RunnerModule<O>,
  schema: HostSchemaLike<O>,
  specifier: string,
  host: unknown,
  file: string,
  options: ValidateHostOptions,
): O {
  if (isRecord(host)) {
    assertKindShape(runner.kind, specifier, host, file);
    if (options.tokens !== "allow") {
      const token = findToken(host);
      if (token) {
        throw new RunnerError(
          `${file}: \`${token.path}\` is an unresolved output token (${token.key}).`,
          "Resolve the host (resolveHostOutputs) before validating it for a verb; `ph run` does this.",
        );
      }
    }
    assertKnownVerbs(runner, specifier, host, file);
  }
  // `$$` escapes protect literal `$`-keyed objects through the token walk;
  // the schema (and the verb) see the literal.
  const result = schema.safeParse(unwrapEscapes(host));
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => {
        // Dotted, as before T3 (other runners' tests match on it).
        const where = issue.path.map(String).join(".") || "<root>";
        // A token in a field that does not take one: say so, rather than
        // the field type's own "expected string".
        const message = tokenKeyOf(valueAt(host, issue.path))
          ? "this field does not take an output token (it is not token-able); spell the value literally."
          : issue.message;
        return `  - ${where}: ${message}`;
      })
      .join("\n");
    throw new RunnerError(
      `${file} failed validation against the hostSchema of "${specifier}":\n${issues || "  (no details reported)"}`,
    );
  }
  return result.data;
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
