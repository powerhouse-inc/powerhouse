import {
  detectFeatures,
  generateAllSubgraphs,
  generateSubgraph,
  generateSubgraphDir,
  syncFeatureDependencies,
} from "@powerhousedao/codegen";
import {
  buildTsMorphProject,
  subgraphDirStyle,
  type SubgraphStyle,
} from "@powerhousedao/codegen/utils";
import { kebabCase } from "change-case";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";
import { resolveModuleDirName } from "../utils/module-dir.js";
import { findSubgraphNameConflict } from "../utils/subgraph-type-lint.js";
import { warnSubgraphTypeConflicts } from "../utils/warn-subgraph-type-conflicts.js";

const INDEX_FILE_EXPECTATION = {
  "schema-first": "a class extending BaseSubgraph with a string literal `name`",
  "code-first":
    "a class extending Subgraph with a string literal `static subgraphName`",
} satisfies Record<SubgraphStyle, string>;

async function assertSubgraphNameFree(projectDir: string, name: string) {
  const conflict = await findSubgraphNameConflict(projectDir, name);
  if (conflict) throw new Error(conflict);
}

/** Codegen reads a directory's form from its index.ts. When that file is
 * gone, lib.ts or resolvers.ts still marks a legacy subgraph: only the legacy
 * subgraph generator writes them. */
function holdsLegacySubgraphFiles(projectDir: string, name: string) {
  const dir = join(projectDir, "subgraphs", kebabCase(name));
  return ["lib.ts", "resolvers.ts"].some((file) => existsSync(join(dir, file)));
}

export async function startGenerateSubgraph(
  args: GenerateSubgraphArgs,
  projectDir: string,
) {
  const { name, dir, all, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  const report: string[] = [];
  if (all) {
    const { subgraphNames, unreadableDirs } =
      await generateAllSubgraphs(project);
    if (subgraphNames.length === 0 && unreadableDirs.length === 0) {
      report.push("No subgraphs found in subgraphs/.");
    }
    for (const subgraphName of subgraphNames) {
      report.push(`Regenerated subgraph "${subgraphName}"`);
    }
    for (const dirName of unreadableDirs) {
      console.warn(
        `Skipped subgraphs/${dirName}: expected its index.ts to export ${INDEX_FILE_EXPECTATION[subgraphDirStyle(join(projectDir, "subgraphs"), dirName)]}. Kept the manifest's subgraphs.`,
      );
    }
  } else if (name) {
    await assertSubgraphNameFree(projectDir, name);
    await generateSubgraph(name, project, {
      codeFirst: !holdsLegacySubgraphFiles(projectDir, name),
    });
  } else if (dir) {
    const dirName = resolveModuleDirName(
      projectDir,
      "subgraphs",
      dir,
      "my-subgraph",
    );
    if (!existsSync(join(projectDir, "subgraphs", dirName, "index.ts"))) {
      throw new Error(`subgraphs/${dirName} has no index.ts.`);
    }
    const { subgraphName, style } = await generateSubgraphDir(dirName, project);
    if (!subgraphName) {
      throw new Error(
        `Could not read subgraphs/${dirName}/index.ts: expected ${INDEX_FILE_EXPECTATION[style]}.`,
      );
    }
    report.push(`Regenerated subgraph "${subgraphName}"`);
  } else {
    console.log("Please specify one of `name`, `dir`, or `all`.");
    return;
  }
  await project.save();
  for (const line of report) {
    console.log(line);
  }
  await warnSubgraphTypeConflicts(projectDir);
  const added = await syncFeatureDependencies(
    detectFeatures(projectDir),
    projectDir,
  );
  await installAddedDependencies(added, projectDir, args.skipInstall);
}
