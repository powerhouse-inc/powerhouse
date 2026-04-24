import { fileExistsSync, isDirectory } from "@powerhousedao/shared/clis";
import {
  DocumentModelGlobalStateSchema,
  type DocumentModelGlobalState,
} from "@powerhousedao/shared/document-model";
import { type Dirent } from "fs";
import { loadJsonFileSync } from "load-json-file";
import path from "path";
import {
  conditional,
  constant,
  filter,
  find,
  flatMap,
  isDefined,
  isIncludedIn,
  isStrictEqual,
  isString,
  map,
  pipe,
  when,
} from "remeda";
import type {
  ObjectLiteralExpression,
  SourceFile,
  VariableStatement,
} from "ts-morph";
import { SyntaxKind } from "ts-morph";

/** Returns a ts-morph ObjectLiteralExpression from a variable statement
 * if the type matches
 */
export function getObjectLiteral(statement: VariableStatement | undefined) {
  return statement
    ?.getDeclarations()
    .at(0)
    ?.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression);
}

/** Returns the value of a property in a ts-morph ObjectLiteralExpression of type T if it exists */
export function getObjectProperty<T extends SyntaxKind>(
  object: ObjectLiteralExpression | undefined,
  propertyName: string,
  propertyType: T,
) {
  return object
    ?.getProperty(propertyName)
    ?.asKind(SyntaxKind.PropertyAssignment)
    ?.getChildren()
    .find((child) => child.getKind() === propertyType)
    ?.asKindOrThrow(propertyType);
}

export function getVariableDeclarationByTypeName(
  sourceFile: SourceFile,
  typeName: string,
) {
  const declaration = sourceFile.getVariableDeclaration((declaration) => {
    // First try matching the type annotation text (more reliable when types
    // can't be fully resolved, e.g. in external projects with linked deps)
    const typeAnnotation = declaration.getTypeNode()?.getText() ?? "";
    if (typeAnnotation.includes(typeName)) return true;
    // Fall back to resolved type text
    return declaration.getType().getText().includes(typeName);
  });
  return declaration;
}

export function getProperyAssignmentByName(
  sourceFile: SourceFile | undefined,
  propertyName: string,
) {
  if (!isDefined(sourceFile)) return undefined;

  return find(
    sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAssignment),
    (assignment) => isStrictEqual(assignment.getName(), propertyName),
  );
}

export function getStringPropertyValue(
  sourceFile: SourceFile | undefined,
  propertyName: string,
) {
  return getProperyAssignmentByName(sourceFile, propertyName)
    ?.getFirstDescendantByKind(SyntaxKind.StringLiteral)
    ?.getLiteralValue();
}

export function getStringArrayPropertyElements(
  sourceFile: SourceFile | undefined,
  propertyName: string,
) {
  return pipe(
    getProperyAssignmentByName(sourceFile, propertyName)
      ?.getFirstDescendantByKind(SyntaxKind.ArrayLiteralExpression)
      ?.getElements() ?? [],
    map((element) =>
      element.asKind(SyntaxKind.StringLiteral)?.getLiteralValue(),
    ),
    filter(isString),
  );
}

export function getBooleanPropertyValue(
  sourceFile: SourceFile | undefined,
  propertyName: string,
  fallback?: boolean,
) {
  return pipe(
    getProperyAssignmentByName(sourceFile, propertyName)?.getDescendants() ??
      [],
    map((descendant) => descendant.getKind()),
    conditional(
      [(kinds) => isIncludedIn(SyntaxKind.TrueKeyword, kinds), constant(true)],
      [
        (kinds) => isIncludedIn(SyntaxKind.FalseKeyword, kinds),
        constant(false),
      ],
      constant(fallback),
    ),
  );
}

export function loadDocumentModelInDir(
  dirent: Dirent | undefined,
): DocumentModelGlobalState | undefined {
  if (!isDirectory(dirent)) return undefined;

  const parseResult = pipe(
    dirent,
    (dir) => path.join(dir.parentPath, `${dir.name}/${dir.name}.json`),
    when(fileExistsSync, loadJsonFileSync),
    (stateFile) => DocumentModelGlobalStateSchema().safeParse(stateFile),
  );

  if (!parseResult.success) {
    console.error(parseResult.error);
    return undefined;
  }

  return parseResult.data;
}

export function getAllImportNames(sourceFile: SourceFile | undefined) {
  return pipe(
    sourceFile?.getImportDeclarations() ?? [],
    flatMap((importDeclaration) => importDeclaration.getNamedImports()),
    map((importSpecifier) => importSpecifier.getText()),
  );
}

export function getAllImportModuleSpecifiers(
  sourceFile: SourceFile | undefined,
) {
  return pipe(
    sourceFile?.getImportDeclarations() ?? [],
    flatMap((importDeclaration) =>
      importDeclaration.getModuleSpecifier().getLiteralValue(),
    ),
  );
}
