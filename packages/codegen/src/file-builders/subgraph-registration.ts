import path from "path";
import { filter, flatMap, isTruthy, map, pipe, uniqueBy } from "remeda";
import type { Project } from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getOrCreateSourceFile,
  projectPath,
  readSubgraphClass,
} from "utils";
import { createOrUpdateManifest } from "./manifest.js";

/** @experimental Lists the subgraph in `subgraphs/index.ts` and the manifest. Both styles
 * register here, so one barrel exports schema-first and code-first classes. */
export async function registerSubgraph(args: {
  project: Project;
  subgraphsDir: string;
  subgraph: { name: string; id: string };
}) {
  const { project, subgraphsDir, subgraph } = args;
  await makeSubgraphsIndexFile({ project, subgraphsDir });
  await createOrUpdateManifest(
    { subgraphs: [subgraph] },
    path.dirname(projectPath(project, subgraphsDir)),
  );
}

export async function makeSubgraphsIndexFile(args: {
  project: Project;
  subgraphsDir: string;
}) {
  const { project } = args;
  const subgraphsDir = projectPath(project, args.subgraphsDir);
  // skipAddingFilesFromTsConfig leaves other subgraphs out of the project; add
  // their index files so the aggregate exports every subgraph, not just the new one.
  project.addSourceFilesAtPaths(path.join(subgraphsDir, "**", "index.ts"));
  const { sourceFile } = getOrCreateSourceFile(
    project,
    path.join(subgraphsDir, "index.ts"),
  );
  const existingExportNames = pipe(
    sourceFile.getExportDeclarations(),
    map((exportDeclaration) =>
      exportDeclaration.getNamespaceExport()?.getName(),
    ),
    filter(isTruthy),
  );

  const subgraphClasses = pipe(
    project.getDirectoryOrThrow(subgraphsDir).getDescendantSourceFiles(),
    filter((sourceFile) => sourceFile.getBaseName() === "index.ts"),
    uniqueBy((sourceFile) => sourceFile.getFilePath()),
    map((sourceFile) => ({
      ...readSubgraphClass(project, sourceFile, subgraphsDir),
      // The module the barrel exports is subgraphs/<dir>/index.ts, whichever
      // file under <dir> declares the class.
      subgraphDir: path
        .relative(subgraphsDir, sourceFile.getDirectoryPath())
        .split(/[\\/]/)[0],
    })),
    // A code-first anonymous default class has no name to export its module
    // under; a schema-first one still throws, as it always has.
    filter(
      ({ style, classDeclaration }) =>
        style === "schema-first" || classDeclaration?.getName() !== undefined,
    ),
    flatMap(({ classDeclaration, subgraphDir }) =>
      classDeclaration === undefined || subgraphDir === ""
        ? []
        : [{ name: classDeclaration.getNameOrThrow(), subgraphDir }],
    ),
    uniqueBy(({ name }) => name),
  );
  const exportDeclarations = pipe(
    subgraphClasses,
    filter(({ name }) => !existingExportNames.includes(name)),
    map(({ name, subgraphDir }) => ({
      namespaceExport: name,
      moduleSpecifier: `./${subgraphDir}/index.js`,
    })),
  );
  sourceFile.addExportDeclarations(exportDeclarations);
  await formatSourceFileWithPrettier(sourceFile);
}
