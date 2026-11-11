import type { DefinitionSource } from "@powerhousedao/shared/clis/definition-sources";
import { discoverDocumentModelDirectories } from "document-model/tooling";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { capitalize, sortBy, unique, uniqueBy } from "remeda";
import {
  documentModelsIndexTemplate,
  documentModelsTemplate,
  upgradeManifestsTemplate,
} from "templates";
import {
  Node,
  Project,
  SyntaxKind,
  VariableDeclarationKind,
  type ImportDeclaration,
  type SourceFile,
  type Statement,
} from "ts-morph";
import {
  formatSourceFileWithPrettier,
  getVariableDeclarationByTypeName,
} from "utils";
import {
  documentModelImport,
  documentModelsDirOf,
  type DocumentModelsDir,
} from "../../utils/document-models-dir.js";
import {
  canonicalDocumentModelsDir,
  type DocumentModelInventory,
} from "./document-model-inventory.js";

const ALIAS_PREFIX = "codeFirstSource";
const isCodeFirstText = (text: string) => text.startsWith(ALIAS_PREFIX);

const INDEX = "index.ts";
const DOCUMENT_MODELS = "document-models.ts";
const UPGRADE_MANIFESTS = "upgrade-manifests.ts";
const AGGREGATES = [INDEX, DOCUMENT_MODELS, UPGRADE_MANIFESTS] as const;
type Aggregate = (typeof AGGREGATES)[number];

/** The re-export some packages added to `document-models/index.ts`; kept where it exists. */
const LEGACY_DOCUMENT_MODELS_EXPORT = "./document-models.js";

/**
 * `ph init` 6.0.0-dev.106 to dev.111 imported each list's element type from
 * the shared package. Later versions import it from `document-model`.
 */
const LEGACY_LIST_TYPES_MODULE = "@powerhousedao/shared/document-model";
const LEGACY_LIST_TYPE: Partial<Record<Aggregate, string>> = {
  [DOCUMENT_MODELS]: "DocumentModelModule",
  [UPGRADE_MANIFESTS]: "UpgradeManifest",
};

function isLegacyListTypeImport(
  statement: ImportDeclaration,
  file: Aggregate,
): boolean {
  const listType = LEGACY_LIST_TYPE[file];
  const named = statement.getNamedImports();
  return (
    listType !== undefined &&
    statement.isTypeOnly() &&
    statement.getDefaultImport() === undefined &&
    named.length === 1 &&
    named.every(
      (type) =>
        type.getName() === listType && type.getAliasNode() === undefined,
    )
  );
}

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
export function accessPath(alias: string, exportPath: readonly string[] = []) {
  return exportPath.reduce(
    (value, key) =>
      /^[A-Za-z_$][\w$]*$/.test(key)
        ? `${value}.${key}`
        : `${value}[${JSON.stringify(key)}]`,
    alias,
  );
}

function currentText(project: Project, path: string): string | undefined {
  const inProject = project.getSourceFile(path);
  if (inProject !== undefined) return inProject.getFullText();
  return existsSync(path) ? readFileSync(path, "utf8") : undefined;
}

function isGeneratedStatement(
  statement: Statement,
  file: Aggregate,
  legacyEntries: ReadonlySet<string>,
): boolean {
  if (Node.isImportDeclaration(statement)) {
    const from = statement.getModuleSpecifierValue();
    const namespace = statement.getNamespaceImport()?.getText();
    if (namespace !== undefined) return isCodeFirstText(namespace);
    if (from === LEGACY_LIST_TYPES_MODULE) {
      return isLegacyListTypeImport(statement, file);
    }
    return (
      file !== INDEX &&
      (from === "document-model" ||
        from.startsWith("document-models/") ||
        /^\.\.?\/./.test(from))
    );
  }
  if (Node.isExportDeclaration(statement)) {
    const from = statement.getModuleSpecifierValue();
    // `export {};` only marks a file as a module. Older boilerplate seeded it.
    if (from === undefined) return statement.getNamedExports().length === 0;
    return (
      file === INDEX &&
      !statement.isNamespaceExport() &&
      statement.getNamedExports().length > 0 &&
      (/^\.\.?\/(?:.+\/)?[^/]+\/(?:v\d+\/)?module\.js$/.test(from) ||
        (legacyEntries.has(from) &&
          statement
            .getNamedExports()
            .every(
              (named) =>
                named.getName() === "module" &&
                named.getAliasNode() !== undefined,
            )) ||
        from === "./upgrade-manifests.js" ||
        from === LEGACY_DOCUMENT_MODELS_EXPORT)
    );
  }
  if (Node.isVariableStatement(statement)) {
    return statement.getDeclarations().every((declaration) => {
      const name = declaration.getName();
      const initializer = declaration.getInitializer()?.getText() ?? "";
      return (
        (file === DOCUMENT_MODELS && name === "documentModels") ||
        (file === UPGRADE_MANIFESTS && name === "upgradeManifests") ||
        (file === INDEX && isCodeFirstText(initializer))
      );
    });
  }
  return false;
}

function authoredStatements(
  file: Aggregate,
  text: string,
  legacyEntries: ReadonlySet<string>,
): string[] {
  const parsed = new Project({ useInMemoryFileSystem: true }).createSourceFile(
    file,
    text,
  );
  return parsed
    .getStatements()
    .filter(
      (statement) => !isGeneratedStatement(statement, file, legacyEntries),
    )
    .map((statement) => statement.getText().split("\n")[0]);
}

function hadLegacyDocumentModelsExport(text: string | undefined): boolean {
  if (text === undefined) return false;
  return new Project({ useInMemoryFileSystem: true })
    .createSourceFile(INDEX, text)
    .getExportDeclarations()
    .some(
      (declaration) =>
        declaration.getModuleSpecifierValue() ===
          LEGACY_DOCUMENT_MODELS_EXPORT &&
        declaration
          .getNamedExports()
          .some((named) => named.getName() === "documentModels"),
    );
}

type SchemaFirstVersion = {
  readonly name: string;
  readonly directory: string;
  readonly version: string;
};

function discoverSchemaFirstDirectories(
  inventory: DocumentModelInventory,
): string[] {
  return discoverDocumentModelDirectories(
    inventory.projectDir,
    inventory.documentModelsDir,
  )
    .directories.filter(({ kind }) => kind === "stored" || kind === "generated")
    .map(({ path }) => path);
}

function schemaFirstModules(
  project: Project,
  directories: readonly string[],
): {
  readonly versions: readonly SchemaFirstVersion[];
  readonly manifests: readonly { name: string; directory: string }[];
} {
  // skipAddingFilesFromTsConfig leaves other models out of the project.
  project.addSourceFilesAtPaths(
    directories.flatMap((directory) => [
      join(directory, "v*", "module.ts"),
      join(directory, "upgrades", "upgrade-manifest.ts"),
    ]),
  );
  const modelDirectories = new Set(directories.map((path) => resolve(path)));
  const modelDirectoryOf = (file: SourceFile) => {
    const directory = file.getDirectory().getParentOrThrow();
    return modelDirectories.has(resolve(directory.getPath()))
      ? directory.getBaseName()
      : undefined;
  };
  const versions = project.getSourceFiles().flatMap((file) => {
    const version = file.getDirectory().getBaseName();
    const directory = modelDirectoryOf(file);
    if (
      directory === undefined ||
      file.getBaseName() !== "module.ts" ||
      !/^v\d+$/.test(version)
    ) {
      return [];
    }
    const declaration = getVariableDeclarationByTypeName(file, "DocumentModel");
    return declaration === undefined
      ? []
      : [{ name: declaration.getName(), directory, version }];
  });
  const manifests = project.getSourceFiles().flatMap((file) => {
    const directory = modelDirectoryOf(file);
    if (
      directory === undefined ||
      file.getBaseName() !== "upgrade-manifest.ts" ||
      file.getDirectory().getBaseName() !== "upgrades"
    ) {
      return [];
    }
    const declaration = getVariableDeclarationByTypeName(
      file,
      "UpgradeManifest",
    );
    return declaration === undefined
      ? []
      : [{ name: declaration.getName(), directory }];
  });
  return {
    versions: sortBy(
      versions,
      ({ directory }) => directory,
      ({ version }) => version,
    ),
    manifests: uniqueBy(
      sortBy(manifests, ({ directory }) => directory),
      ({ name }) => name,
    ),
  };
}

/**
 * Removes the file's leading comment and returns it. A statement inserted at
 * the top would otherwise take the "do not edit" header along, so the header
 * goes back on top once the edits are done.
 */
function detachHeader(sourceFile: SourceFile) {
  const header = /^\/\*[\s\S]*?\*\/\n*/.exec(sourceFile.getFullText())?.[0];
  if (header !== undefined) sourceFile.removeText(0, header.length);
  return header;
}

function exportedNames(sourceFile: SourceFile) {
  return new Set(
    sourceFile
      .getExportDeclarations()
      .flatMap((declaration) =>
        declaration
          .getNamedExports()
          .map((named) =>
            (named.getAliasNode() ?? named.getNameNode()).getText(),
          ),
      ),
  );
}

/** Refuses a barrel rewrite before generation changes any model or metadata. */
export function assertDocumentModelAggregatesWritable(
  project: Project,
  projectDir: string,
): void {
  const legacyEntries = new Set(
    discoverDocumentModelDirectories(
      projectDir,
      documentModelsDirOf(projectDir).path,
    )
      .directories.filter(
        ({ kind }) => kind === "stored" || kind === "generated",
      )
      .map(({ path }) =>
        emittedImportPath(
          canonicalDocumentModelsDir(projectDir),
          projectDir,
          `./${relative(projectDir, join(path, "index.ts")).replaceAll("\\", "/")}`,
        ),
      ),
  );
  const authored = AGGREGATES.flatMap((file) => {
    const text = currentText(
      project,
      join(canonicalDocumentModelsDir(projectDir), file),
    );
    return text === undefined
      ? []
      : authoredStatements(file, text, legacyEntries).map(
          (statement) => `- document-models/${file}: ${statement}`,
        );
  });
  if (authored.length > 0) {
    throw new Error(
      [
        "Codegen rebuilds the document-models barrels, which hold statements it did not write, so nothing was generated:",
        ...authored,
        "Move these statements into another module, then generate again.",
      ].join("\n"),
    );
  }
}

/**
 * Writes `document-models/index.ts`, `document-models.ts` and
 * `upgrade-manifests.ts` from the package's whole inventory: every
 * schema-first module the stored and generated directories hold, then every
 * code-first model and upgrade manifest, each once. Each file is rebuilt, so
 * a removed or renamed model leaves no export behind. Nothing is created
 * for a package without models. Returns the files whose text changed.
 */
export async function writeDocumentModelAggregates(
  project: Project,
  inventory: DocumentModelInventory,
): Promise<SourceFile[]> {
  const outputDir = canonicalDocumentModelsDir(inventory.projectDir);
  const paths = Object.fromEntries(
    AGGREGATES.map((file) => [file, join(outputDir, file)]),
  ) as Record<Aggregate, string>;
  const before = Object.fromEntries(
    AGGREGATES.map((file) => [file, currentText(project, paths[file])]),
  ) as Record<Aggregate, string | undefined>;

  assertDocumentModelAggregatesWritable(project, inventory.projectDir);

  const schemaFirst = schemaFirstModules(
    project,
    discoverSchemaFirstDirectories(inventory),
  );

  const empty =
    schemaFirst.versions.length === 0 &&
    schemaFirst.manifests.length === 0 &&
    inventory.documentModels.length === 0 &&
    inventory.upgradeManifests.length === 0;
  if (empty && AGGREGATES.every((file) => before[file] === undefined)) {
    return [];
  }
  const legacyExport = hadLegacyDocumentModelsExport(before[INDEX]);
  const modelsDir: DocumentModelsDir = {
    path: inventory.documentModelsDir,
    canonical: resolve(inventory.documentModelsDir) === resolve(outputDir),
  };
  /** The barrels link stored models by alias in ./document-models, by relative path elsewhere. */
  const moduleExport = (directory: string, version: string) =>
    modelsDir.canonical
      ? `./${directory}/${version}/module.js`
      : emittedImportPath(
          outputDir,
          inventory.projectDir,
          `./${relative(inventory.projectDir, join(modelsDir.path, directory, version, "module.ts")).replaceAll("\\", "/")}`,
        );

  const models = project.createSourceFile(
    paths[DOCUMENT_MODELS],
    documentModelsTemplate,
    { overwrite: true },
  );
  const modelList = models
    .getVariableDeclarationOrThrow("documentModels")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (const { name, directory, version } of schemaFirst.versions) {
    const exportName = `${name}${capitalize(version)}`;
    models.addImportDeclaration({
      namedImports: [`${name} as ${exportName}`],
      moduleSpecifier: documentModelImport(
        modelsDir,
        outputDir,
        directory,
        version,
      ),
    });
    modelList.addElement(exportName);
  }

  const index = project.createSourceFile(
    paths[INDEX],
    documentModelsIndexTemplate,
    { overwrite: true },
  );
  for (const { name, directory, version } of schemaFirst.versions) {
    index.addExportDeclaration({
      namedExports: [`${name} as ${name}${capitalize(version)}`],
      moduleSpecifier: moduleExport(directory, version),
    });
  }
  // Upgrade manifests ride the same subpath so node-side package loaders
  // (reactor-api) can pick them up without importing the package root, which
  // would pull editors into a node process.
  index.addExportDeclaration({
    namedExports: ["upgradeManifests"],
    moduleSpecifier: "./upgrade-manifests.js",
  });
  if (legacyExport) {
    index.addExportDeclaration({
      namedExports: ["documentModels"],
      moduleSpecifier: LEGACY_DOCUMENT_MODELS_EXPORT,
    });
  }

  const manifests = project.createSourceFile(
    paths[UPGRADE_MANIFESTS],
    upgradeManifestsTemplate,
    { overwrite: true },
  );
  const manifestList = manifests
    .getVariableDeclarationOrThrow("upgradeManifests")
    .getFirstDescendantByKindOrThrow(SyntaxKind.ArrayLiteralExpression);
  for (const { name, directory } of schemaFirst.manifests) {
    manifests.addImportDeclaration({
      namedImports: [name],
      moduleSpecifier: documentModelImport(
        modelsDir,
        outputDir,
        directory,
        "upgrades",
      ),
    });
    manifestList.addElement(name);
  }

  const files = [index, models, manifests];
  for (const file of files) await formatSourceFileWithPrettier(file);
  if (addCodeFirstEntries({ index, models, manifests }, inventory, outputDir)) {
    for (const file of files) await formatSourceFileWithPrettier(file);
  }
  return files.filter(
    (file) => file.getFullText() !== before[file.getBaseName() as Aggregate],
  );
}

function addCodeFirstEntries(
  files: {
    readonly index: SourceFile;
    readonly models: SourceFile;
    readonly manifests: SourceFile;
  },
  inventory: DocumentModelInventory,
  outputDir: string,
): boolean {
  if (
    inventory.documentModels.length === 0 &&
    inventory.upgradeManifests.length === 0
  ) {
    return false;
  }
  const { index, models, manifests } = files;
  const all = [index, models, manifests];
  const headers = all.map(detachHeader);
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
          outputDir,
          inventory.projectDir,
          specifier,
        ),
      });
    }
  };

  const taken = exportedNames(index);
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
  all.forEach((file, position) => {
    const header = headers[position];
    if (header !== undefined) file.insertText(0, `${header.trimEnd()}\n`);
  });
  return true;
}
