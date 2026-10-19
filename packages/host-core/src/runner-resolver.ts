import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { runnerKindSchema, type RunnerKind } from "./host-schemas.js";
import { findToken } from "./tokens.js";

/**
 * Resolves a host's `runner.module` specifier from the PROJECT's dependency
 * tree (not ph-cli's), imports it, and checks the runner-module contract:
 * `{ run, hostSchema, kind, ...optionalVerbs }`.
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
  hostSchema: HostSchemaLike<O>;
  kind: RunnerKind;
  [key: string]: unknown;
}

/** Exports that are part of the contract but are not verbs. */
const NON_VERB_EXPORTS = new Set(["hostSchema", "kind", "default"]);

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
  if (!runnerKindSchema.safeParse(module.kind).success) {
    throw new RunnerError(
      `Runner "${specifier}" does not export a valid \`kind\` (got ${JSON.stringify(module.kind)}; expected "reactor" | "compound").`,
    );
  }
  return module as unknown as RunnerModule;
}

export function listVerbs<O>(runner: RunnerModule<O>): string[] {
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
  if (typeof candidate !== "function" || NON_VERB_EXPORTS.has(verb)) {
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

/**
 * Validate a host against its runner and return the PARSED host (what the
 * verb receives). Resolved form (`tokens: "forbid"`): output tokens are not
 * resolved before T3, so a token anywhere fails here with its path.
 */
export function validateHost<O>(
  runner: RunnerModule<O>,
  specifier: string,
  host: unknown,
  file: string,
): O {
  if (isRecord(host)) {
    assertKindShape(runner.kind, specifier, host, file);
    const token = findToken(host);
    if (token) {
      throw new RunnerError(
        `${file}: \`${token.path}\` is an output token (${token.key}), which this host system does not resolve yet.`,
        "Spell the value literally.",
      );
    }
    assertKnownVerbs(runner, specifier, host, file);
  }
  const result = runner.hostSchema.safeParse(host);
  if (!result.success) {
    const issues = result.error.issues
      .map(
        (issue) =>
          `  - ${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`,
      )
      .join("\n");
    throw new RunnerError(
      `${file} failed validation against the hostSchema of "${specifier}":\n${issues || "  (no details reported)"}`,
    );
  }
  return result.data;
}
