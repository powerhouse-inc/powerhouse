import {
  assertPiecesOutDir,
  planPieces,
} from "@powerhousedao/shared/build-pieces";
import { getPowerhouseProjectInfo } from "@powerhousedao/shared/clis";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { formatDefinitionDiagnostic } from "document-model/tooling";
import { readPackage } from "read-pkg";
import type { BuildArgs, PublishArgs } from "../types.js";
import { createGenerationSteps } from "./definitions/build-steps.js";
import {
  type GenerationResult,
  type GenerationSteps,
  runGeneration,
} from "./definitions/generation.js";
import { readRetainedApproval } from "./definitions/release-approval.js";
import { renderHuman } from "./render-report.js";
import { HOST_ROUTES_DIR, OFFERED_ROUTES_MODULE } from "./offered-routes.js";
import {
  canonicalConfigFile,
  resolvePackagePaths,
} from "./definitions/paths.js";
import {
  selectedCliSources,
  selectedConfigFile,
  selectedPackageRoot,
  selectedSourceSetDigest,
} from "./definitions/selection.js";

export {
  markOfferedRoutes,
  noConnectImports,
  offeredRoutesManifest,
} from "./offered-routes.js";

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
> & { readonly ignoreTypeErrors?: true };

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
    ...(parsed.ignoreTypeErrors === true && { ignoreTypeErrors: true }),
  };
}

export async function runBuild(
  args: BuildArgs,
  options: RunBuildOptions = {},
): Promise<GenerationResult> {
  const { packageRoot, outDir } = resolvePackagePaths({
    packageRoot: selectedPackageRoot(args),
    outDir: args.outDir,
  });
  await assertManifestNameMatchesPackage(packageRoot);
  assertPiecesOutDir({
    outDir,
    pieces: planPieces(packageRoot, outDir),
  });

  // Project routes type-check against the tree generated from them. The
  // probes mirror resolveConnectRoutesDir, so builder-tools loads only when needed.
  const routeProbes = [
    HOST_ROUTES_DIR,
    ".ph/connect-routes.gen.ts",
    OFFERED_ROUTES_MODULE,
  ];
  if (routeProbes.some((p) => existsSync(join(packageRoot, p)))) {
    const { resolveConnectRoutesDir, syncConnectRoutes } =
      await import("@powerhousedao/builder-tools");
    await syncConnectRoutes(packageRoot, resolveConnectRoutesDir(packageRoot));
  }

  return await runGeneration({
    packageRoot,
    configFile: canonicalConfigFile(selectedConfigFile(args)),
    allowMissingConfig: args.configFile === undefined,
    outDir,
    cliSources: selectedCliSources(args),
    warningsAsErrors: args.warningsAsErrors,
    steps: options.steps ?? (await createGenerationSteps(args)),
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
  const retained = await readRetainedApproval({
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
      compilerOutputs: retained.approval.compilerOutputs,
    };
  }
  log(`▶ Running a release check: ${retained.reason}.\n`);
  const result = await runBuild(args, { ...options, log });
  logBuildReport(result, log);
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
  const { exitCode, typeErrorsAccepted } = await runPrepack(
    {
      ...selection,
      debug: args.debug,
      noSharedDeps: false,
      ignoreTypeErrors: false,
    },
    options,
  );
  // An accepted run retains no approval, so the prepack hook builds again;
  // it must not ask a second time.
  return {
    exitCode,
    packageRoot,
    prepackEnvironment: {
      [PUBLISH_SELECTION_ENV]: JSON.stringify({
        ...selection,
        ...(typeErrorsAccepted === true && { ignoreTypeErrors: true }),
      }),
    },
  };
}

export function logBuildReport(
  result: GenerationResult,
  log: (text: string) => void = writeStderr,
): void {
  if (result.report === undefined) return;
  if (result.status === "ok") {
    for (const diagnostic of result.report.diagnostics) {
      if (diagnostic.severity === "warning") {
        log(`⚠ ${formatDefinitionDiagnostic(diagnostic)}\n`);
      }
    }
    return;
  }
  log(`${renderHuman(result.report)}\n`);
}
