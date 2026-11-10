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
import {
  extractSubgraphDocuments,
  findSubgraphNameConflict,
  generateSubgraphFromDocument,
  getDocument,
  saveSpec,
} from "@powerhousedao/vetra/codegen";
import type { SubgraphModuleDocument } from "@powerhousedao/vetra/document-models/subgraph-module";
import { kebabCase } from "change-case";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { GenerateSubgraphArgs } from "../types.js";
import { installAddedDependencies } from "../utils/install-added-dependencies.js";
import { resolveModuleDirName } from "../utils/module-dir.js";
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

/** The notice for `--code-first` on an existing schema-first subgraph, which
 * is then left unchanged. */
function codeFirstOnSchemaFirst(
  args: GenerateSubgraphArgs,
  projectDir: string,
  name: string,
): string | undefined {
  if (!args.codeFirst) return undefined;
  const subgraphsDir = join(projectDir, "subgraphs");
  const dirName = kebabCase(name);
  if (
    !existsSync(join(subgraphsDir, dirName, "index.ts")) ||
    subgraphDirStyle(subgraphsDir, dirName) !== "schema-first"
  )
    return undefined;
  return `subgraphs/${dirName} is schema-first; --code-first only applies to new subgraphs. To convert it, run ph migrate --subgraph ${dirName}.`;
}

export async function startGenerateSubgraph(
  args: GenerateSubgraphArgs,
  projectDir: string,
) {
  const { name, document, dir, all, extract, debug } = args;
  if (debug) {
    console.log({ args });
  }
  const project = buildTsMorphProject(projectDir);
  if (extract) {
    const docs = extractSubgraphDocuments(project);
    if (docs.length === 0) {
      console.log("No subgraphs found in subgraphs/.");
    }
    for (const doc of docs) {
      const path = await saveSpec(doc, projectDir);
      console.log(`Wrote ${path}`);
    }
    return;
  }
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
  } else if (document) {
    const doc = (await getDocument(document)) as SubgraphModuleDocument;
    const notice = codeFirstOnSchemaFirst(
      args,
      projectDir,
      doc.state.global.name,
    );
    if (notice) {
      console.log(notice);
      return;
    }
    await assertSubgraphNameFree(projectDir, doc.state.global.name);
    await generateSubgraphFromDocument(doc, project, {
      codeFirst: args.codeFirst,
    });
  } else if (name) {
    const notice = codeFirstOnSchemaFirst(args, projectDir, name);
    if (notice) {
      console.log(notice);
      return;
    }
    await assertSubgraphNameFree(projectDir, name);
    await generateSubgraph(name, project, { codeFirst: args.codeFirst });
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
    console.log(
      "Please specify one of `name`, `document`, `dir`, `all`, or `extract`.",
    );
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
