import {
  browserBuildConfig,
  nodeBuildConfig,
} from "@powerhousedao/shared/build-config";
import { spawnAsync } from "@powerhousedao/shared/clis";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from "node:path";
import { detect, resolveCommand } from "package-manager-detector";
import { readPackage } from "read-pkg";
import { build as tsdownBuild } from "tsdown";
import type { BuildArgs } from "../types.js";
import {
  retainReleaseDefinitionCheck,
  runBuildDefinitionCheck,
} from "./definition-release.js";
import { resolveSelectedDefinitionSourcePaths } from "./definition-check.js";
import { assertNoSymlinks, relativePathWithin } from "./file-tree.js";

const FIXED_BUILD_INPUTS = [
  "document-models",
  "editors",
  "index.ts",
  "package.json",
  "powerhouse.manifest.json",
  "processors",
  "reactor",
  "style.css",
  "subgraphs",
  "tsconfig.json",
] as const;

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

function buildOutputPath(projectRoot: string, outDir: string): string {
  const outputPath = resolve(projectRoot, outDir);
  const logicalPath = relative(projectRoot, outputPath);
  if (
    logicalPath === "" ||
    logicalPath === ".." ||
    logicalPath.startsWith(`..${sep}`) ||
    isAbsolute(logicalPath)
  ) {
    throw new Error("The build output directory must be inside the package.");
  }
  return outputPath;
}

function assertDedicatedBuildOutput(
  projectRoot: string,
  outputPath: string,
  args: Pick<BuildArgs, "configFile" | "sources">,
): void {
  const protectedPaths = [
    resolve(args.configFile),
    ...FIXED_BUILD_INPUTS.map((path) => resolve(projectRoot, path)),
    ...resolveSelectedDefinitionSourcePaths({
      configFile: args.configFile,
      sources: args.sources,
    }),
  ];
  const containedInput = protectedPaths.find(
    (path) =>
      relativePathWithin(outputPath, path) !== null ||
      relativePathWithin(path, outputPath) !== null,
  );
  if (containedInput) {
    throw new Error(
      `The build output directory contains a package input: ${relative(projectRoot, containedInput) || "."}. Choose a dedicated output directory.`,
    );
  }
}

async function replaceBuildOutput(
  stagingPath: string,
  outputPath: string,
): Promise<void> {
  const backupPath = join(
    dirname(outputPath),
    `.${basename(outputPath)}.backup-${process.pid}-${randomUUID()}`,
  );
  let hasBackup = false;
  try {
    try {
      await rename(outputPath, backupPath);
      hasBackup = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    try {
      await rename(stagingPath, outputPath);
    } catch (error) {
      if (hasBackup) {
        try {
          await rename(backupPath, outputPath);
          hasBackup = false;
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Failed to install the new build output and restore the prior output.",
            { cause: rollbackError },
          );
        }
      }
      throw error;
    }

    if (hasBackup) {
      try {
        await rm(backupPath, { recursive: true, force: true });
      } catch (error) {
        console.warn(
          `The build succeeded, but its previous output backup could not be removed: ${String(error)}`,
        );
      }
    }
  } finally {
    await rm(stagingPath, { recursive: true, force: true });
  }
}

export async function runBuild(args: BuildArgs) {
  const projectRoot = process.cwd();
  const outputPath = buildOutputPath(projectRoot, args.outDir);
  assertDedicatedBuildOutput(projectRoot, outputPath, args);

  // Fail fast if the manifest name and package.json name have drifted apart.
  await assertManifestNameMatchesPackage(projectRoot);

  const detectResult = await detect();
  const agent = detectResult?.agent ?? "npm";

  const allowTypeScriptErrors =
    args.allowTsErrors === true || process.env.PH_BUILD_ALLOW_TS_ERRORS === "1";

  if (allowTypeScriptErrors) {
    console.warn(
      "The TypeScript error escape hatch is deprecated. Remove --allow-ts-errors or PH_BUILD_ALLOW_TS_ERRORS and fix the reported errors.",
    );
  }

  const outputSymlinkError = (path: string) =>
    new Error(
      `The build output path crosses a symbolic link at ${relative(projectRoot, path) || "."}.`,
    );
  await assertNoSymlinks(projectRoot, dirname(outputPath), outputSymlinkError);
  await mkdir(dirname(outputPath), { recursive: true });
  await assertNoSymlinks(projectRoot, outputPath, outputSymlinkError);
  const [projectIdentity, outputParentIdentity] = await Promise.all([
    realpath(projectRoot),
    realpath(dirname(outputPath)),
  ]);
  const expectedOutputParentIdentity = resolve(
    projectIdentity,
    relative(projectRoot, dirname(outputPath)),
  );
  if (outputParentIdentity !== expectedOutputParentIdentity) {
    throw outputSymlinkError(dirname(outputPath));
  }
  const canonicalOutputPath = join(outputParentIdentity, basename(outputPath));
  const stagingPath = await mkdtemp(
    join(outputParentIdentity, `.${basename(outputPath)}.staging-`),
  );
  const stagingTsconfig = join(stagingPath, ".ph-build-tsconfig.json");
  const stagingTsBuildInfo = join(stagingPath, ".ph-build.tsbuildinfo");
  await writeFile(
    stagingTsconfig,
    `${JSON.stringify({
      extends: resolve(projectRoot, "tsconfig.json"),
      compilerOptions: {
        declarationDir: join(stagingPath, "types"),
        outDir: join(stagingPath, "types"),
        tsBuildInfoFile: stagingTsBuildInfo,
      },
    })}\n`,
    { encoding: "utf8", flag: "wx" },
  );

  try {
    // Emit types into the staged generation. The temporary config inherits all
    // source and compiler settings while redirecting publishable compiler output.
    const tscCommand = resolveCommand(agent, "execute-local", [
      "tsc",
      "--build",
      stagingTsconfig,
    ]);
    if (tscCommand === null) {
      throw new Error(
        "You need to have typescript installed to use the `build` command.",
      );
    }

    console.log("\n▶ Running the TypeScript build...");
    if (allowTypeScriptErrors) {
      try {
        await spawnAsync(tscCommand.command, tscCommand.args, {
          cwd: projectRoot,
          stdio: "inherit",
        });
        console.log("✔ TypeScript build completed");
      } catch {
        console.warn(
          "✘ tsc reported errors above; continuing because the deprecated TypeScript error escape hatch is enabled.",
        );
      }
    } else {
      await spawnAsync(tscCommand.command, tscCommand.args, {
        cwd: projectRoot,
        stdio: "inherit",
      });
      console.log("✔ TypeScript build completed");
    }

    const definitionReport = await runBuildDefinitionCheck({
      configFile: args.configFile,
      outDir: args.outDir,
      additionalOutputDirectories: [stagingPath],
      sources: args.sources,
    });

    await tsdownBuild({
      ...browserBuildConfig,
      outDir: join(stagingPath, "browser"),
    });

    await tsdownBuild({
      ...nodeBuildConfig,
      outDir: join(stagingPath, "node"),
    });

    const executeLocalCommand = resolveCommand(agent, "execute-local", [
      "tailwindcss",
      "-i",
      "./style.css",
      "-o",
      join(stagingPath, "style.css"),
    ]);
    if (executeLocalCommand === null) {
      throw new Error(
        "You need to have tailwindcss installed to use the `build` command.",
      );
    }
    await spawnAsync(executeLocalCommand.command, executeLocalCommand.args, {
      cwd: projectRoot,
      stdio: "inherit",
    });
    await retainReleaseDefinitionCheck({
      configFile: args.configFile,
      outDir: stagingPath,
      additionalOutputDirectories: [args.outDir],
      report: definitionReport,
    });
    await rm(stagingTsconfig, { force: true });
    await rm(stagingTsBuildInfo, { force: true });
    await replaceBuildOutput(stagingPath, canonicalOutputPath);
  } catch (error) {
    await rm(stagingPath, { recursive: true, force: true });
    throw error;
  }
}
