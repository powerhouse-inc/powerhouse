import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { HostDefinition } from "./host-loader.js";

/**
 * Resolves a host's `runner.module` specifier from the PROJECT's dependency
 * tree (not ph-cli's), imports it, and checks the runner-module contract:
 * `{ run, hostSchema, kind, ...optionalVerbs }`. Phase-0 home is ph-cli; the
 * uniform-runners plan moves this into @powerhousedao/host-core with the
 * generic compound (phase 1).
 */

export class RunnerError extends Error {
  constructor(message: string, hint?: string) {
    super(hint ? `${message}\n  Hint: ${hint}` : message);
    this.name = "RunnerError";
  }
}

export interface RunnerContext {
  projectRoot: string;
  verb: string;
  env: Record<string, string | undefined>;
}

export type RunnerVerb = (
  host: HostDefinition,
  ctx: RunnerContext,
) => Promise<unknown>;

/** zod-shaped structurally, so this module needs no zod dependency. */
export interface HostSchemaLike {
  safeParse(host: unknown): {
    success: boolean;
    error?: { issues?: { path: (string | number)[]; message: string }[] };
  };
}

export interface RunnerModule {
  run: RunnerVerb;
  hostSchema: HostSchemaLike;
  kind: string;
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
  if (typeof module.kind !== "string") {
    throw new RunnerError(
      `Runner "${specifier}" does not export \`kind\` (e.g. "reactor" | "compound").`,
    );
  }
  return module as unknown as RunnerModule;
}

export function listVerbs(runner: RunnerModule): string[] {
  return Object.entries(runner)
    .filter(
      ([name, value]) =>
        typeof value === "function" && !NON_VERB_EXPORTS.has(name),
    )
    .map(([name]) => name)
    .sort();
}

export function getVerb(
  runner: RunnerModule,
  specifier: string,
  verb: string,
): RunnerVerb {
  const candidate = runner[verb];
  if (typeof candidate !== "function" || NON_VERB_EXPORTS.has(verb)) {
    throw new RunnerError(
      `Runner "${specifier}" does not support the verb "${verb}". Supported verbs: ${listVerbs(
        runner,
      ).join(", ")}.`,
    );
  }
  return candidate as RunnerVerb;
}

export function validateHost(
  runner: RunnerModule,
  specifier: string,
  host: HostDefinition,
  file: string,
): void {
  const result = runner.hostSchema.safeParse(host);
  if (!result.success) {
    const issues = (result.error?.issues ?? [])
      .map(
        (issue) => `  - ${issue.path.join(".") || "<root>"}: ${issue.message}`,
      )
      .join("\n");
    throw new RunnerError(
      `${file} failed validation against the hostSchema of "${specifier}":\n${issues || "  (no details reported)"}`,
    );
  }
}
