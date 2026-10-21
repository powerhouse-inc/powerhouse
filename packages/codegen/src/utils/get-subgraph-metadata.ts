import { join } from "path";
import { SyntaxKind, type Project } from "ts-morph";
import { getOrCreateDirectory, projectDirOf } from "utils";

export type SubgraphMetadata =
  | { readonly subgraphName: string; readonly problem?: never }
  | { readonly subgraphName?: never; readonly problem: string };

/** Reads a literal static subgraphName for --dir; leaves protocol validation to the caller. */
export function getSubgraphMetadata(
  project: Project,
  dirName: string,
): SubgraphMetadata {
  const { directory } = getOrCreateDirectory(
    project,
    join(projectDirOf(project), "subgraphs", dirName),
  );
  project.addSourceFilesAtPaths(join(directory.getPath(), "**", "*.ts"));
  const classes = directory
    .getDescendantSourceFiles()
    .sort((left, right) =>
      left.getFilePath().localeCompare(right.getFilePath()),
    )
    .flatMap((file) => file.getClasses());
  const computed: string[] = [];
  for (const declaration of classes) {
    const property = declaration
      .getStaticProperty("subgraphName")
      ?.asKind(SyntaxKind.PropertyDeclaration);
    if (property === undefined) continue;
    const literal = property.getInitializerIfKind(SyntaxKind.StringLiteral);
    if (literal !== undefined)
      return { subgraphName: literal.getLiteralValue() };
    computed.push(declaration.getName() ?? "an anonymous class");
  }
  if (computed.length > 0) {
    return {
      problem: `${computed.join(", ")} in subgraphs/${dirName} declare${computed.length === 1 ? "s" : ""} static subgraphName without a string literal, so --dir cannot read it. Write it as static override readonly subgraphName = "my-subgraph", or regenerate with --all.`,
    };
  }
  return {
    problem: `subgraphs/${dirName} has no class with a static subgraphName. Old-style subgraphs (\`name\`/\`typeDefs\`/\`resolvers\`): run \`ph migrate\`.`,
  };
}
