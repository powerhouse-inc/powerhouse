import { kebabCase } from "change-case";
import { pruneManifestSection, registerSubgraph } from "file-builders";
import { join } from "node:path";
import { filter, isDefined, map, pipe, prop, unique } from "remeda";
import type { Project } from "ts-morph";
import {
  getOrCreateDirectory,
  getSubgraphDirNames,
  getSubgraphMetadata,
  projectPath,
  subgraphDirStyle,
  type SubgraphStyle,
} from "utils";
import { generateCodeFirstSubgraph } from "../file-builders/code-first-subgraph.js";
import { projectSourceText } from "../utils/subgraph-style.js";
import { tsMorphGenerateSubgraph } from "./schema-first/subgraph-scaffold.js";

/** Generates `subgraphName` into `subgraphs/<kebab-case name>`. An existing
 * directory keeps its own style: a schema-first one is completed as before,
 * and a code-first one is only registered, so no SDL file lands in it. A
 * directory that does not exist yet is written code first with `codeFirst`,
 * schema first otherwise. */
export async function generateNamedSubgraph(
  subgraphName: string,
  project: Project,
  options: { readonly codeFirst?: boolean },
) {
  const subgraphsDir = projectPath(project, "subgraphs");
  const dirName = kebabCase(subgraphName);
  const read = projectSourceText(project);
  if (read(join(subgraphsDir, dirName, "index.ts")) === undefined) {
    // A code-first subgraph of this name in a renamed directory stays there.
    const moved = getSubgraphDirNames(project).some((other) => {
      const metadata = getSubgraphMetadata(project, other);
      return (
        metadata.style === "code-first" && metadata.subgraphName === dirName
      );
    });
    if (moved) await registerCodeFirstSubgraph(project, dirName);
    else if (options.codeFirst === true)
      await generateCodeFirstSubgraph(subgraphName, project);
    else await tsMorphGenerateSubgraph({ subgraphName, project });
  } else if (subgraphDirStyle(subgraphsDir, dirName, read) === "schema-first") {
    await tsMorphGenerateSubgraph({ subgraphName, project });
  } else {
    const own = getSubgraphMetadata(project, dirName).subgraphName;
    if (own === undefined) {
      throw new Error(
        `subgraphs/${dirName} declares a class that extends Subgraph but none with a string literal \`static subgraphName\`, so nothing was generated.`,
      );
    }
    await registerCodeFirstSubgraph(project, own);
  }
}

async function registerCodeFirstSubgraph(
  project: Project,
  subgraphName: string,
) {
  await registerSubgraph({
    project,
    subgraphsDir: projectPath(project, "subgraphs"),
    subgraph: { name: subgraphName, id: kebabCase(subgraphName) },
  });
}

/** Writes to `subgraphs/<kebab(subgraphName)>` as main always has, even when
 * the subgraph's own directory was renamed, unless that target is code first. */
async function regenerateSchemaFirstSubgraph(
  project: Project,
  subgraphName: string,
) {
  const target = kebabCase(subgraphName);
  const subgraphsDir = projectPath(project, "subgraphs");
  if (
    subgraphDirStyle(subgraphsDir, target, projectSourceText(project)) ===
    "schema-first"
  ) {
    await tsMorphGenerateSubgraph({ subgraphName, project });
  }
}

async function regenerateSubgraph(
  project: Project,
  style: SubgraphStyle,
  subgraphName: string,
) {
  if (style === "code-first") {
    await registerCodeFirstSubgraph(project, subgraphName);
  } else {
    await regenerateSchemaFirstSubgraph(project, subgraphName);
  }
}

/** @experimental Regenerates the existing `subgraphs/<dirName>` in its own style. Its
 * `subgraphName` is `undefined` when its index.ts names no subgraph; then
 * nothing was written. */
export async function generateSubgraphDir(dirName: string, project: Project) {
  const metadata = getSubgraphMetadata(project, dirName);
  if (metadata.subgraphName !== undefined) {
    await regenerateSubgraph(project, metadata.style, metadata.subgraphName);
  }
  return metadata;
}

/* Regenerates each directory found in the project's `subgraphs` directory.
 * Returns the subgraphs it regenerated, and the directories whose `index.ts`
 * it could not read.
 */
export async function generateAllSubgraphs(project: Project) {
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  const projectDir = subgraphsDir.getParentOrThrow().getPath();
  const dirNames = getSubgraphDirNames(project);
  /* The subgraph's name is found in the `index.ts` file */
  const subgraphs = dirNames.map((dirName) => ({
    dirName,
    ...getSubgraphMetadata(project, dirName),
  }));
  const unreadableDirs = subgraphs
    .filter(({ subgraphName }) => subgraphName === undefined)
    .map(prop("dirName"));
  const subgraphNames = pipe(
    subgraphs,
    map(prop("subgraphName")),
    filter(isDefined),
    unique(),
  );
  const regenerated = new Set<string>();
  for (const { style, subgraphName } of subgraphs) {
    if (subgraphName === undefined) continue;
    if (style === "schema-first") {
      if (regenerated.has(subgraphName)) continue;
      regenerated.add(subgraphName);
    }
    await regenerateSubgraph(project, style, subgraphName);
  }

  // An unreadable index.ts may be a subgraph's, so its manifest entry stays.
  if (unreadableDirs.length === 0) {
    await pruneManifestSection(
      projectDir,
      "subgraphs",
      subgraphNames.map((name) => kebabCase(name)),
    );
  }
  return { subgraphNames, unreadableDirs };
}
