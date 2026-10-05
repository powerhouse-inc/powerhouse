import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readPackage } from "read-pkg";
import type { BuildArgs, PublishArgs } from "../types.js";
import { createGenerationSteps } from "./definitions/build-steps.js";
import {
  type GenerationResult,
  type GenerationSteps,
  readRetainedApproval,
  runGeneration,
} from "./definitions/generation.js";
import {
  selectedCliSources,
  selectedConfigFile,
  selectedPackageRoot,
  selectedSourceSetDigest,
} from "./definitions/selection.js";

/**
 * A Powerhouse package's `powerhouse.manifest.json` "name" must match its
 * `package.json` "name" — Connect and the registry resolve installed versions
 * by treating the manifest name as the npm package name, so a mismatch silently
 * breaks resolution. Fail the build early if they diverge. No-op when the
 * project has no manifest (nothing to compare).
 */
export async function assertManifestNameMatchesPackage(projectPath: string) {
  const manifestPath = join(projectPath, "powerhouse.manifest.json");
  if (!existsSync(manifestPath)) return;

  const { name: packageName } = await readPackage({ cwd: projectPath });

  let manifestName: unknown;
  try {
    manifestName = (
      JSON.parse(readFileSync(manifestPath, "utf-8")) as { name?: unknown }
    ).name;
  } catch {
    throw new Error(
      `Failed to parse "powerhouse.manifest.json" at ${manifestPath}. Make sure it is valid JSON.`,
    );
  }

  if (manifestName !== packageName) {
    throw new Error(
      `Package name mismatch — "package.json" and "powerhouse.manifest.json" must have the same "name":\n` +
        `  package.json             "name": ${JSON.stringify(packageName)}\n` +
        `  powerhouse.manifest.json "name": ${JSON.stringify(manifestName)}\n\n` +
        `Update one so they match, then run the build again.`,
    );
  }
}

type RunBuildOptions = {
  readonly steps?: GenerationSteps;
  readonly log?: (text: string) => void;
  readonly promoteOutput?: boolean;
};

const writeStderr = (text: string): void => {
  process.stderr.write(text);
};

const PUBLISH_SELECTION_ENV = "PH_PUBLISH_SELECTION";

type PublishSelection = Pick<
  BuildArgs,
  "outDir" | "configFile" | "source" | "warningsAsErrors"
>;

function publishSelection(): PublishSelection | undefined {
  const raw = process.env[PUBLISH_SELECTION_ENV];
  if (raw === undefined) return undefined;
  const parsed = JSON.parse(raw) as Partial<PublishSelection>;
  if (
    typeof parsed.outDir !== "string" ||
    typeof parsed.configFile !== "string" ||
    !Array.isArray(parsed.source) ||
    typeof parsed.warningsAsErrors !== "boolean"
  ) {
    throw new Error(`${PUBLISH_SELECTION_ENV} is not a publish selection.`);
  }
  return {
    outDir: parsed.outDir,
    configFile: parsed.configFile,
    source: parsed.source.map(String),
    warningsAsErrors: parsed.warningsAsErrors,
  };
}

export async function runBuild(
  args: BuildArgs,
  options: RunBuildOptions = {},
): Promise<GenerationResult> {
  const packageRoot = selectedPackageRoot(args);
  await assertManifestNameMatchesPackage(packageRoot);

  return await runGeneration({
    packageRoot,
    configFile: selectedConfigFile(args),
    outDir: args.outDir,
    cliSources: selectedCliSources(args),
    warningsAsErrors: args.warningsAsErrors,
    steps: options.steps ?? (await createGenerationSteps(args.outDir)),
    log: options.log ?? writeStderr,
    ...(options.promoteOutput !== undefined && {
      promoteOutput: options.promoteOutput,
    }),
  });
}

export async function runPrepack(
  hookArgs: BuildArgs,
  options: RunBuildOptions = {},
): Promise<GenerationResult> {
  const args = { ...hookArgs, ...publishSelection() };
  const log = options.log ?? writeStderr;
  const retained = readRetainedApproval({
    packageRoot: selectedPackageRoot(args),
    outDir: args.outDir,
    warningsAsErrors: args.warningsAsErrors,
    sourceSetDigest: selectedSourceSetDigest(args),
  });
  if (retained.ok) {
    log("✔ Reusing the completed release check for this revision.\n");
    return {
      status: "ok",
      exitCode: 0,
      phases: [],
      report: retained.approval.report,
    };
  }
  log(`▶ Running a release check: ${retained.reason}.\n`);
  const result = await runBuild(args, { ...options, log });
  await logRefusal(result, log);
  return result;
}

export async function runPublishCheck(
  args: PublishArgs,
  options: RunBuildOptions = {},
): Promise<{
  readonly exitCode: 0 | 1 | 2;
  readonly packageRoot: string;
  readonly prepackEnvironment: Readonly<Record<string, string>>;
}> {
  let packageRoot: string;
  if (args.configFile === undefined) {
    const { projectPath } = await getPowerhouseProjectInfo();
    if (!projectPath) throw new Error("Could not find project path.");
    packageRoot = projectPath;
  } else {
    packageRoot = selectedPackageRoot(args);
  }
  const selection: PublishSelection = {
    outDir: args.outDir,
    configFile: selectedConfigFile(args, packageRoot),
    source: args.source,
    warningsAsErrors: args.warningsAsErrors,
  };
  const { exitCode } = await runPrepack(
    { ...selection, debug: args.debug },
    options,
  );
  return {
    exitCode,
    packageRoot,
    prepackEnvironment: { [PUBLISH_SELECTION_ENV]: JSON.stringify(selection) },
  };
}

export async function logRefusal(
  result: GenerationResult,
  log: (text: string) => void = writeStderr,
): Promise<void> {
  if (result.status === "ok" || result.report === undefined) return;
  const { renderHuman } = await import("./model-check.js");
  log(`${renderHuman(result.report)}\n`);
}
