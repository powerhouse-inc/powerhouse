import type { DefinitionSource } from "@powerhousedao/shared/clis/definition-sources";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { isDefined, unique } from "remeda";
import { documentModelsIndexTemplate } from "../../templates/boilerplate/document-models/index.js";
import { documentModelsTemplate } from "../../templates/boilerplate/document-models/document-models.js";
import { upgradeManifestsTemplate } from "../../templates/boilerplate/document-models/upgrade-manifests.js";
import {
  SyntaxKind,
  VariableDeclarationKind,
  type Project,
  type SourceFile,
} from "ts-morph";
import { formatSourceFileWithPrettier, getOrCreateSourceFile } from "utils";
import type { CodeFirstInventory } from "./code-first-inventory.js";

const ALIAS_PREFIX = "codeFirstSource";
const isCodeFirstText = (text: string) => text.startsWith(ALIAS_PREFIX);

export function emittedImportPath(
  fromDir: string,
  projectDir: string,
  specifier: `./${string}`,
): string {
  const emitted = specifier.replace(/\.([mc]?)tsx?$/, ".$1js");
  const path = relative(fromDir, resolve(projectDir, emitted)).replaceAll(
    "\\",
    "/",
  );
  return path.startsWith(".") ? path : `./${path}`;
}

/**
 * Every export path key is a property name string, array positions included,
 * so a key that is not an identifier is read as a string literal. A numeric
 * literal would read another property for "01" or "9007199254740993".
 */
function accessPath(alias: string, exportPath: readonly string[] = []) {
  return exportPath.reduce(
    (value, key) =>
      /^[A-Za-z_$][\w$]*$/.test(key)
        ? `${value}.${key}`
        : `${value}[${JSON.stringify(key)}]`,
    alias,
  );
}

function openAggregate(project: Project, path: string, template?: string) {
  if (!existsSync(path) && !project.getSourceFile(path)) {
    if (template === undefined) return undefined;
    return project.createSourceFile(path, template);
  }
  return getOrCreateSourceFile(project, path).sourceFile;
}

/**
 * Removes the file's leading comment and returns it. A statement codegen
 * removes or inserts at the top would otherwise take the "do not edit" header
 * along, so the header goes back on top once the edits are done.
 */
function detachHeader(sourceFile: SourceFile) {
  const header = /^\/\*[\s\S]*?\*\/\n*/.exec(sourceFile.getFullText())?.[0];
  if (header !== undefined) sourceFile.removeText(0, header.length);
  return header;
}

function stripCodeFirstEntries(sourceFile: SourceFile) {
  for (const declaration of sourceFile.getImportDeclarations()) {
    const namespace = declaration.getNamespaceImport()?.getText();
    if (namespace !== undefined && isCodeFirstText(namespace)) {
      declaration.remove();
    }
  }
  for (const statement of sourceFile.getVariableStatements()) {
    const initializer = statement.getDeclarations()[0]?.getInitializer();
    if (initializer && isCodeFirstText(initializer.getText())) {
      statement.remove();
    }
  }
  for (const array of sourceFile.getDescendantsOfKind(
    SyntaxKind.ArrayLiteralExpression,
  )) {
    for (const element of array.getElements().toReversed()) {
      if (isCodeFirstText(element.getText())) {
        array.removeElement(element);
      }
    }
  }
}

function exportedNames(sourceFile: SourceFile) {
  return new Set([
    ...sourceFile
      .getExportDeclarations()
      .flatMap((declaration) =>
        declaration
          .getNamedExports()
          .map((named) =>
            (named.getAliasNode() ?? named.getNameNode()).getText(),
          ),
      ),
    ...sourceFile
      .getVariableStatements()
      .filter((statement) => statement.isExported())
      .flatMap((statement) =>
        statement.getDeclarations().map((declaration) => declaration.getName()),
      ),
  ]);
}

export async function writeCodeFirstAggregates(
  project: Project,
  inventory: CodeFirstInventory,
): Promise<SourceFile[]> {
  const documentModelsDir = join(inventory.projectDir, "document-models");
  const empty =
    inventory.documentModels.length === 0 &&
    inventory.upgradeManifests.length === 0;
  const [index, models, manifests] = (
    [
      ["index.ts", documentModelsIndexTemplate],
      ["document-models.ts", documentModelsTemplate],
      ["upgrade-manifests.ts", upgradeManifestsTemplate],
    ] as const
  ).map(([name, template]) =>
    openAggregate(
      project,
      join(documentModelsDir, name),
      empty ? undefined : template,
    ),
  );
  const files = [index, models, manifests].filter(isDefined);
  const before = files.map((file) => file.getFullText());
  const headers = files.map(detachHeader);
  files.forEach(stripCodeFirstEntries);
  const finish = async () => {
    files.forEach((file, position) => {
      const header = headers[position];

      if (header !== undefined) {
        file.insertText(0, empty ? header : `${header.trimEnd()}\n`);
      }
    });
    const written = files.filter(
      (file, position) => file.getFullText() !== before[position],
    );
    for (const file of written) await formatSourceFileWithPrettier(file);
    return written;
  };
  if (empty || !index || !models || !manifests) return await finish();

  const aliases = new Map(
    unique(
      [...inventory.documentModels, ...inventory.upgradeManifests]
        .map(({ source }) => source.specifier)
        .sort(),
    ).map((specifier, position) => [specifier, `${ALIAS_PREFIX}${position}`]),
  );
  const reference = ({ source }: { source: DefinitionSource }) =>
    accessPath(aliases.get(source.specifier) ?? "", source.exportPath);
  const importAliases = (
    sourceFile: SourceFile,
    entries: readonly { source: DefinitionSource }[],
  ) => {
    for (const specifier of unique(
      entries.map(({ source }) => source.specifier),
    )) {
      sourceFile.addImportDeclaration({
        namespaceImport: aliases.get(specifier) ?? "",
        moduleSpecifier: emittedImportPath(
          documentModelsDir,
          inventory.projectDir,
          specifier,
        ),
      });
    }
  };

  const taken = exportedNames(index);
  if (!taken.has("upgradeManifests")) {
    index.addExportDeclaration({
      namedExports: ["upgradeManifests"],
      moduleSpecifier: "./upgrade-manifests.js",
    });
  }
  importAliases(index, inventory.documentModels);
  for (const model of inventory.documentModels) {
    const name = model.aggregateExportName;
    if (taken.has(name)) {
      throw new Error(
        `document-models/index.ts already exports ${name}, so the code-first model ${model.documentType} needs another name.`,
      );
    }
    taken.add(name);
    index.addVariableStatement({
      isExported: true,
      declarationKind: VariableDeclarationKind.Const,
      declarations: [{ name, initializer: reference(model) }],
    });
  }
  importAliases(models, inventory.documentModels);
  const modelList = models
    .getVariableDeclarationOrThrow("documentModels")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (const model of inventory.documentModels) {
    modelList.addElement(reference(model));
  }

  importAliases(manifests, inventory.upgradeManifests);
  const manifestList = manifests
    .getVariableDeclarationOrThrow("upgradeManifests")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (const manifest of inventory.upgradeManifests) {
    manifestList.addElement(reference(manifest));
  }

  return await finish();
}
