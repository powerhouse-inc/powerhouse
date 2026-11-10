import { join } from "path";
import {
  type ClassDeclaration,
  Node,
  type Project,
  type SourceFile,
  SyntaxKind,
} from "ts-morph";
import { getOrCreateDirectory } from "utils";
import { instanceNameLiteral } from "./schema-first/subgraph-name.js";
import {
  codeFirstClasses,
  projectSourceText,
  type SubgraphStyle,
} from "./subgraph-style.js";

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

/** Whether `classDeclaration` is a subgraph class. */
export function extendsBaseSubgraph(classDeclaration: ClassDeclaration) {
  // `extends` text needs no resolution; the base class needs reactor-api.
  return (
    (classDeclaration.getExtends()?.getText().includes("BaseSubgraph") ||
      classDeclaration.getBaseClass()?.getText().includes("BaseSubgraph")) ??
    false
  );
}

function staticSubgraphNameLiteral(classDeclaration: ClassDeclaration) {
  return classDeclaration
    .getStaticProperty("subgraphName")
    ?.asKind(SyntaxKind.PropertyDeclaration)
    ?.getInitializerIfKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}

/** @experimental The subgraph class an `index.ts` under `subgraphs/`
 * declares, its style and its name. A code-first class names itself with
 * `static subgraphName`, a schema-first one with its instance `name`; either
 * is read only as a string literal. */
export function readSubgraphClass(
  project: Project,
  sourceFile: SourceFile,
  subgraphsDir: string,
): {
  readonly style: SubgraphStyle;
  readonly classDeclaration?: ClassDeclaration;
  readonly subgraphName?: string;
} {
  const classes = sourceFile.getClasses();
  const codeFirst = codeFirstClasses(
    sourceFile.getFilePath(),
    subgraphsDir,
    projectSourceText(project),
  ).map(({ name }) => name);
  if (codeFirst.length > 0) {
    const named = (candidate: ClassDeclaration) =>
      staticSubgraphNameLiteral(candidate) !== undefined;
    const classDeclaration =
      classes.find(
        (candidate) =>
          codeFirst.includes(candidate.getName()) && named(candidate),
      ) ??
      codeFirst
        .flatMap((name) =>
          name === undefined
            ? []
            : (sourceFile.getExportedDeclarations().get(name) ?? []),
        )
        .filter(Node.isClassDeclaration)
        .find(named);
    return {
      style: "code-first",
      classDeclaration,
      subgraphName:
        classDeclaration && staticSubgraphNameLiteral(classDeclaration),
    };
  }
  const classDeclaration = classes.find(extendsBaseSubgraph);
  return {
    style: "schema-first",
    classDeclaration,
    subgraphName: classDeclaration && instanceNameLiteral(classDeclaration),
  };
}

/**
 * The subgraph name of `subgraphs/<dirName>/` and its style.
 *
 * The `style` property is experimental.
 */
export function getSubgraphMetadata(
  project: Project,
  dirName: string,
): { subgraphName: string | undefined; style: SubgraphStyle } {
  const { directory: subgraphDir } = getOrCreateDirectory(
    project,
    join("subgraphs", dirName),
  );
  project.addSourceFileAtPathIfExists(join(subgraphDir.getPath(), "index.ts"));
  const sourceFile = subgraphDir.getSourceFile("index.ts");
  if (sourceFile === undefined)
    return { subgraphName: undefined, style: "schema-first" };
  const { style, subgraphName } = readSubgraphClass(
    project,
    sourceFile,
    subgraphDir.getParentOrThrow().getPath(),
  );
  return { subgraphName, style };
}
