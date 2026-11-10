import { existsSync } from "node:fs";
import { join } from "node:path";
import type { BuildArgs } from "../types.js";
import { BuildRefusal } from "./package-build/pipeline/steps.js";
import { type BuildOptions, buildPackage } from "./package-build/run-build.js";
import { standardBuildSteps } from "./package-build/steps/standard.js";
import { subgraphStep } from "./subgraph-build-step.js";

export { assertExternalDependenciesDeclared } from "./package-build/steps/bundles.js";
export { assertManifestNameMatchesPackage } from "./package-build/steps/package-checks.js";
export { createTraceFiles, traceFiles } from "./package-build/steps/trace.js";

/**
 * The gate loads codegen, so a build without `checkDefinitions` or without a
 * `subgraphs/` directory never imports it.
 */
async function withSubgraphStep(options: BuildOptions): Promise<BuildOptions> {
  if (!options.checkDefinitions) return options;
  if (!existsSync(join(process.cwd(), "subgraphs"))) return options;
  const { hasCodeFirstSubgraph } = await import("./model/subgraph-gate.js");
  if (!hasCodeFirstSubgraph(process.cwd())) return options;
  return {
    ...options,
    steps: [...(options.steps ?? standardBuildSteps), subgraphStep],
  };
}

/**
 * `ph build`, and the package build `ph connect build` and the switchboard
 * runner start from. A refusal (missing tsc or tailwindcss, type errors not
 * accepted, a release check that fails) prints its message and exits 1 once
 * the previous output is back, as these callers have always seen it.
 * Only `ph build` passes `checkDefinitions`, so the other callers import
 * none of the package's modules. A command that adds steps passes
 * `[...standardBuildSteps, ...its own]` as `steps`.
 */
export async function runBuild(
  args: BuildArgs,
  options: BuildOptions = {},
): Promise<void> {
  try {
    return await buildPackage(args, await withSubgraphStep(options));
  } catch (error) {
    if (!(error instanceof BuildRefusal)) throw error;
    console.error(error.message);
    process.exit(error.exitCode);
  }
}
