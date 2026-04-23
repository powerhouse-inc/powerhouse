import { join } from "path";
import { find, isDefined, pipe, when } from "remeda";
import { SyntaxKind, type Project } from "ts-morph";
import { getOrCreateDirectory } from "utils";

export function getSubgraphMetadata(project: Project, dirName: string) {
  const { directory: subgraphDir } = getOrCreateDirectory(
    project,
    join("subgraphs", dirName),
  );

  return pipe(
    subgraphDir.getSourceFile("index.ts")?.getClasses() ?? [],
    find(
      (classDeclaration) =>
        classDeclaration.getBaseClass()?.getText().includes("BaseSubgraph") ??
        false,
    ),
    when(
      (classDeclaration) => isDefined(classDeclaration),
      (classDeclaration) =>
        classDeclaration
          .getInstanceProperty("name")
          ?.asKind(SyntaxKind.PropertyDeclaration)
          ?.getInitializerIfKind(SyntaxKind.StringLiteral)
          ?.getLiteralValue(),
    ),
    when(
      (subgraphName) => isDefined(subgraphName),
      (subgraphName) => ({ subgraphName }),
    ),
  );
}
