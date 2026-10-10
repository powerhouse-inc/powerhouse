import { join } from "path";
import { find, pipe } from "remeda";
import { SyntaxKind, type Project } from "ts-morph";
import { getOrCreateDirectory } from "utils";

export type SubgraphDiscovery =
  | { kind: "absent" }
  | { kind: "subgraph"; name: string }
  | { kind: "unreadable"; reason: "computed-name" | "unresolved-base-class" };

/**
 * Reads the schema-first subgraph in `subgraphs/<dirName>/index.ts`: its
 * `BaseSubgraph` class, and the name that class declares.
 */
export function discoverSubgraphInDir(
  project: Project,
  dirName: string,
): SubgraphDiscovery {
  const { directory: subgraphDir } = getOrCreateDirectory(
    project,
    join("subgraphs", dirName),
  );
  const classes = subgraphDir.getSourceFile("index.ts")?.getClasses() ?? [];
  const subgraphClass = pipe(
    classes,
    find(
      (classDeclaration) =>
        classDeclaration.getBaseClass()?.getText().includes("BaseSubgraph") ??
        false,
    ),
  );
  if (subgraphClass === undefined) {
    return classes.some((classDeclaration) =>
      classDeclaration
        .getExtends()
        ?.getExpression()
        .getText()
        .includes("BaseSubgraph"),
    )
      ? { kind: "unreadable", reason: "unresolved-base-class" }
      : { kind: "absent" };
  }
  const name = subgraphClass
    .getInstanceProperty("name")
    ?.asKind(SyntaxKind.PropertyDeclaration)
    ?.getInitializerIfKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
  return name === undefined
    ? { kind: "unreadable", reason: "computed-name" }
    : { kind: "subgraph", name };
}

export function getSubgraphMetadata(project: Project, dirName: string) {
  const discovery = discoverSubgraphInDir(project, dirName);
  return {
    subgraphName: discovery.kind === "subgraph" ? discovery.name : undefined,
  };
}
