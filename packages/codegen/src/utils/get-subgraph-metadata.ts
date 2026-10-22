import { join } from "path";
import { find, pipe } from "remeda";
import { SyntaxKind, type Project } from "ts-morph";
import { getOrCreateDirectory } from "utils";

/** Names of the `subgraphs/` directories, on disk or in the project, that hold an `index.ts` */
export function getSubgraphDirNames(project: Project) {
  const { directory: subgraphsDir } = getOrCreateDirectory(
    project,
    "subgraphs",
  );
  // The project starts without files, so load the ones discovery reads.
  project.addSourceFilesAtPaths(join(subgraphsDir.getPath(), "*", "index.ts"));
  return subgraphsDir
    .getDirectories()
    .filter((dir) => dir.getSourceFile("index.ts"))
    .map((dir) => dir.getBaseName())
    .sort();
}

export function getSubgraphMetadata(project: Project, dirName: string) {
  const { directory: subgraphDir } = getOrCreateDirectory(
    project,
    join("subgraphs", dirName),
  );
  project.addSourceFileAtPathIfExists(join(subgraphDir.getPath(), "index.ts"));

  return pipe(
    subgraphDir.getSourceFile("index.ts")?.getClasses() ?? [],
    find(
      (classDeclaration) =>
        // `extends` text needs no resolution; the base class needs reactor-api.
        (classDeclaration.getExtends()?.getText().includes("BaseSubgraph") ||
          classDeclaration
            .getBaseClass()
            ?.getText()
            .includes("BaseSubgraph")) ??
        false,
    ),
    (classDeclaration) =>
      classDeclaration
        ?.getInstanceProperty("name")
        ?.asKind(SyntaxKind.PropertyDeclaration)
        ?.getInitializerIfKind(SyntaxKind.StringLiteral)
        ?.getLiteralValue(),
    (subgraphName) => ({ subgraphName }),
  );
}
