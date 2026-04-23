import { join } from "path";
import {
  conditional,
  constant,
  filter,
  find,
  flatMap,
  isDefined,
  isIncludedIn,
  isString,
  isTruthy,
  map,
  pipe,
  split,
  startsWith,
  when,
} from "remeda";
import { SyntaxKind, type Project, type SourceFile } from "ts-morph";
import { getObjectProperty, getOrCreateDirectory } from "utils";

export function getProcessorMetadata(project: Project, dirName: string) {
  const { directory: processorsDir } = getOrCreateDirectory(
    project,
    "processors",
  );
  const { directory: processorDir } = getOrCreateDirectory(
    project,
    join("processors", dirName),
  );

  const connectProcessorNames = getProcessorNames(
    processorsDir.getSourceFile("connect.ts"),
  );

  const switchboardProcessorNames = getProcessorNames(
    processorsDir.getSourceFile("switchboard.ts"),
  );

  return pipe(dirName, (dirName) => ({
    processorName: dirName,
    /* We can try to determine which processors are for `connect` and for `switchboard`.
     * If we cannot, we fallback to including them in both. */
    processorApps: pipe(
      ["switchboard" as const, "connect" as const],
      when(
        () => !isIncludedIn(dirName, connectProcessorNames),
        () => ["switchboard" as const],
      ),
      when(
        () => !isIncludedIn(dirName, switchboardProcessorNames),
        () => ["connect" as const],
      ),
    ),
    processorType: pipe(
      // handle the old `index.ts` file name if `processor.ts` has not been generated
      processorDir.getSourceFile("processor.ts") ??
        processorDir.getSourceFile("index.ts"),
      (sourceFile) => sourceFile?.getImportDeclarations() ?? [],
      flatMap((importDeclaration) => importDeclaration.getNamedImports()),
      map((importSpecifier) => importSpecifier.getText()),
      // we have to check what type is imported to determine whether the processor is `relationalDb` or `analytics`
      conditional(
        [
          (specifiers) =>
            isDefined(
              find(specifiers, (specifier) =>
                specifier.includes("RelationalDbProcessor"),
              ),
            ),
          () => "relationalDb" as const,
        ],
        [
          (specifiers) =>
            isDefined(
              find(specifiers, (specifier) =>
                specifier.includes("IAnalyticsStore"),
              ),
            ),
          () => "analytics" as const,
        ],
        constant("analytics"),
      ),
    ),
    documentTypes: pipe(
      processorDir.getSourceFile("factory.ts"),
      (sourceFile) =>
        sourceFile?.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression) ??
        [],
      map((objectLiteralExpression) =>
        getObjectProperty(
          objectLiteralExpression,
          "documentType",
          SyntaxKind.ArrayLiteralExpression,
        ),
      ),
      flatMap((o) => o?.getElements()),
      map((e) => e?.asKind(SyntaxKind.StringLiteral)),
      filter(isTruthy),
      map((e) => e.getLiteralValue()),
    ),
  }));
}

const getProcessorNames = (sourceFile: SourceFile | undefined) =>
  pipe(
    sourceFile,
    (sourceFile) => sourceFile?.getImportDeclarations() ?? [],
    flatMap((importDeclaration) =>
      importDeclaration.getModuleSpecifier().getLiteralValue(),
    ),
    filter(startsWith("processors/")),
    map(split("/")),
    map((s) => s.at(1)),
    filter(isString),
  );
