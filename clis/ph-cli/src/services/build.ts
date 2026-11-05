import type { BuildArgs } from "../types.js";
import { BuildRefusal } from "./package-build/pipeline/steps.js";
import { type BuildOptions, buildPackage } from "./package-build/run-build.js";

export { assertExternalDependenciesDeclared } from "./package-build/steps/bundles.js";
export { assertManifestNameMatchesPackage } from "./package-build/steps/package-checks.js";
export { createTraceFiles, traceFiles } from "./package-build/steps/trace.js";

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
    return await buildPackage(args, options);
  } catch (error) {
    if (!(error instanceof BuildRefusal)) throw error;
    console.error(error.message);
    process.exit(error.exitCode);
  }
}
