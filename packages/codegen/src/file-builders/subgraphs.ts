import { camelCase, kebabCase, pascalCase } from "change-case";
import { readManifest } from "file-builders";
import path from "node:path";
import {
  subgraphIndexFileTemplate,
  subgraphSchemaTemplate,
  subgraphsIndexTemplate,
} from "templates";
import { createDiagnostic } from "document-model";
import { formatDefinitionDiagnostic } from "document-model/tooling";
import { existsSync } from "node:fs";
import {
  Node,
  SyntaxKind,
  ts,
  type Identifier,
  type ImportDeclaration,
  type Project,
  type SourceFile,
  type Statement,
} from "ts-morph";
import {
  ensureDirectoriesExist,
  formatSafe,
  formatSourceFileWithPrettier,
  getOrCreateDirectory,
  getOrCreateSourceFile,
  projectDirOf,
} from "utils";
import { subgraphHelperTypeName } from "./subgraph-helper-type.js";

export async function tsMorphGenerateSubgraph(args: {
  subgraphName: string;
  project: Project;
}): Promise<void> {
  const { subgraphName, project } = args;
  const names = {
    kebabCaseName: kebabCase(subgraphName),
    pascalCaseName: pascalCase(subgraphName),
    camelCaseName: camelCase(subgraphName),
  };
  const projectDir = projectDirOf(project);
  const { directory } = getOrCreateDirectory(
    project,
    path.join(projectDir, "subgraphs"),
  );
  const subgraphsDir = directory.getPath();
  await readManifest(projectDir);
  const itemTypeName = await subgraphHelperTypeName(
    projectDir,
    names.pascalCaseName,
  );
  const subgraphDir = path.join(subgraphsDir, names.kebabCaseName);
  await ensureDirectoriesExist(project, subgraphsDir, subgraphDir);

  for (const [name, template] of [
    ["index.ts", subgraphIndexFileTemplate({ ...names, itemTypeName })],
    ["schema.ts", subgraphSchemaTemplate({ ...names, itemTypeName })],
  ]) {
    const { sourceFile, alreadyExists } = getOrCreateSourceFile(
      project,
      path.join(subgraphDir, name),
    );
    if (alreadyExists) continue;
    sourceFile.replaceWithText(template);
    await formatSourceFileWithPrettier(sourceFile);
    await sourceFile.save();
  }

  await makeSubgraphsIndexFile({ project, subgraphsDir });
  await project
    .getSourceFileOrThrow(path.join(subgraphsDir, "index.ts"))
    .save();
}

type SubgraphClass = {
  readonly file: string;
  readonly importName: string;
  readonly preferredName: string;
  readonly moduleSpecifier: string;
};

type BarrelEntry = SubgraphClass & {
  readonly local: string;
  readonly exportName: string;
  readonly check: string;
};

type RootLayout = {
  readonly authored: string;
  readonly trailing: string;
  readonly comments: ReadonlyMap<string, string>;
  readonly hasOwned: boolean;
  readonly bindings: ReadonlySet<string>;
  readonly exportNames: ReadonlySet<string>;
  readonly referenced: ReadonlySet<string>;
  readonly ownedLocals: ReadonlySet<string>;
  readonly covered: ReadonlySet<string>;
  readonly preserved: ReadonlyMap<string, PreservedNames>;
};

type PreservedNames = { readonly local?: string; readonly exportName?: string };

const classKey = (file: string, importName: string) => `${file}#${importName}`;

const BANNER = subgraphsIndexTemplate.slice(
  subgraphsIndexTemplate.indexOf("/**"),
  subgraphsIndexTemplate.indexOf("*/") + 2,
);

/** Regenerates class exports and type checks while preserving authored statements. */
export async function makeSubgraphsIndexFile(args: {
  project: Project;
  subgraphsDir: string;
  requireClassExports?: ReadonlySet<string>;
}) {
  const { sourceFile, text } = await planSubgraphsIndexFile(args);
  if (text === sourceFile.getFullText() && sourceFile.isSaved()) return;
  sourceFile.replaceWithText(text);
  await sourceFile.save();
}

/** Plans the barrel without writing; refuses changes that would lose authored statements. */
export async function planSubgraphsIndexFile(args: {
  project: Project;
  subgraphsDir: string;
  requireClassExports?: ReadonlySet<string>;
}): Promise<{ sourceFile: SourceFile; text: string }> {
  const { project, subgraphsDir } = args;
  loadAuthoredSubgraphSources(project, subgraphsDir);
  const rootPath = path.join(subgraphsDir, "index.ts");
  const { sourceFile } = getOrCreateSourceFile(project, rootPath);
  const refuse = refusal(subgraphsDir, rootPath);
  const syntaxError = firstSyntaxError(sourceFile.getFullText());
  if (syntaxError !== undefined) {
    refuse(
      "subgraphs/index.ts does not parse, so its own statements cannot be told apart from generated ones.",
      syntaxError,
      "Fix the syntax error in subgraphs/index.ts, then run the generator again.",
    );
  }
  const classes = findSubgraphClasses(project, subgraphsDir, sourceFile);
  const layout = await readRootLayout(
    sourceFile,
    subgraphsDir,
    classes,
    args.requireClassExports,
  );
  const helper = unique(["SubgraphCheck"], new Set(layout.bindings));
  const entries = allocateEntries(classes, layout, helper);
  const scratch = project.createSourceFile(
    path.join(subgraphsDir, ".ph-subgraphs-index.ts"),
    "",
    { overwrite: true },
  );
  try {
    const text = await renderBarrel(
      scratch,
      entries,
      layout,
      sourceFile,
      helper,
    );
    validateBarrel(scratch, text, entries, layout, refuse, helper);
    return { sourceFile, text };
  } finally {
    scratch.forget();
  }
}

function loadAuthoredSubgraphSources(project: Project, subgraphsDir: string) {
  project.addSourceFilesAtPaths([
    path.join(subgraphsDir, "**", "*.ts"),
    path.join(subgraphsDir, "**", "*.mts"),
    `!${path.join(subgraphsDir, "**", "*.d.ts")}`,
    `!${path.join(subgraphsDir, "**", "node_modules", "**")}`,
    `!${path.join(subgraphsDir, "**", "dist", "**")}`,
  ]);
}

function refusal(subgraphsDir: string, rootPath: string) {
  const projectDir = path.dirname(subgraphsDir);
  const specifier =
    `./${path.relative(projectDir, rootPath).replaceAll(path.sep, "/")}` as const;
  return (
    message: string,
    received: string | undefined,
    repair: string,
  ): never => {
    throw new Error(
      formatDefinitionDiagnostic(
        createDiagnostic({
          code: "PH-IMPORT-FAILED",
          path: [],
          source: { specifier },
          message,
          received,
          repair,
        }),
      ),
    );
  };
}

function firstSyntaxError(text: string): string | undefined {
  const { diagnostics = [] } = ts.transpileModule(text, {
    fileName: "index.ts",
    reportDiagnostics: true,
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ESNext,
    },
  });
  const first = diagnostics.at(0);
  return first === undefined
    ? undefined
    : ts.flattenDiagnosticMessageText(first.messageText, " ");
}

function findSubgraphClasses(
  project: Project,
  subgraphsDir: string,
  root: SourceFile,
): SubgraphClass[] {
  return project
    .getDirectoryOrThrow(subgraphsDir)
    .getDescendantSourceFiles()
    .filter((file) => file !== root)
    .flatMap((file) => {
      const moduleSpecifier =
        "./" +
        path
          .relative(subgraphsDir, file.getFilePath())
          .replaceAll(path.sep, "/")
          .replace(/\.mts$/, ".mjs")
          .replace(/\.ts$/, ".js");
      const typeOnlyExports = new Set(
        file
          .getExportDeclarations()
          .flatMap((declaration) =>
            declaration
              .getNamedExports()
              .filter(
                (named) => declaration.isTypeOnly() || named.isTypeOnly(),
              ),
          )
          .map((named) => named.getAliasNode()?.getText() ?? named.getName()),
      );
      return [...file.getExportedDeclarations()].flatMap(
        ([importName, declarations]) =>
          declarations.flatMap((klass) =>
            !typeOnlyExports.has(importName) &&
            Node.isClassDeclaration(klass) &&
            klass.getSourceFile() === file &&
            klass.getStaticProperty("subgraphName")
              ? [
                  {
                    file: file.getFilePath(),
                    importName,
                    preferredName:
                      importName === "default"
                        ? (klass.getName() ?? "DefaultSubgraph")
                        : importName,
                    moduleSpecifier,
                  },
                ]
              : [],
          ),
      );
    })
    .sort(
      (left, right) =>
        left.moduleSpecifier.localeCompare(right.moduleSpecifier) ||
        left.importName.localeCompare(right.importName),
    );
}

function subgraphFileOfSpecifier(
  subgraphsDir: string,
  rootPath: string,
  specifier: string | undefined,
): string | undefined {
  if (!specifier?.startsWith("./") && !specifier?.startsWith("../"))
    return undefined;
  const target = path.resolve(subgraphsDir, specifier);
  const relative = path.relative(subgraphsDir, target);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative))
    return undefined;
  const candidates = [
    target.replace(/\.js$/, ".ts").replace(/\.mjs$/, ".mts"),
    target,
    `${target}.ts`,
    path.join(target, "index.ts"),
  ];
  // ts-morph spells every path with forward slashes, as on Windows
  // path.resolve does not, and the barrel compares the two as strings.
  const file = (
    candidates.find((candidate) => existsSync(candidate)) ?? candidates[0]
  ).replaceAll(path.sep, "/");
  return file === rootPath ? undefined : file;
}

function generatedSubgraphSpecifier(
  file: string,
  specifier: string,
  discoveredSpecifier: string | undefined,
): string | undefined {
  if (existsSync(file)) return discoveredSpecifier;
  if (/^\.\/.+\.m?js$/.test(specifier)) return specifier;
  return undefined;
}

type TopLevel = { bindings: string[]; exportNames: string[] };

function topLevelNames(statements: readonly Statement[]): TopLevel {
  const bindings: string[] = [];
  const exportNames: string[] = [];
  for (const statement of statements) {
    if (Node.isImportDeclaration(statement)) {
      const defaultImport = statement.getDefaultImport();
      const namespaceImport = statement.getNamespaceImport();
      if (defaultImport) bindings.push(defaultImport.getText());
      if (namespaceImport) bindings.push(namespaceImport.getText());
      for (const named of statement.getNamedImports())
        bindings.push(named.getAliasNode()?.getText() ?? named.getName());
    } else if (Node.isExportDeclaration(statement)) {
      const namespaceExport = statement.getNamespaceExport();
      if (namespaceExport) exportNames.push(namespaceExport.getName());
      for (const named of statement.getNamedExports())
        exportNames.push(named.getAliasNode()?.getText() ?? named.getName());
    } else if (Node.isExportAssignment(statement)) {
      exportNames.push("default");
    } else if (Node.isVariableStatement(statement)) {
      const names = statement.getDeclarations().flatMap((declaration) => {
        const name = declaration.getNameNode();
        return Node.isIdentifier(name)
          ? [name.getText()]
          : name
              .getDescendantsOfKind(SyntaxKind.Identifier)
              .map((identifier) => identifier.getText());
      });
      bindings.push(...names);
      if (statement.isExported()) exportNames.push(...names);
    } else if (
      Node.isClassDeclaration(statement) ||
      Node.isFunctionDeclaration(statement) ||
      Node.isEnumDeclaration(statement) ||
      Node.isInterfaceDeclaration(statement) ||
      Node.isTypeAliasDeclaration(statement) ||
      Node.isModuleDeclaration(statement)
    ) {
      const name = statement.getName();
      if (Node.isFunctionDeclaration(statement) && !statement.hasBody())
        continue;
      if (name !== undefined) bindings.push(name);
      if (statement.isDefaultExport()) exportNames.push("default");
      else if (statement.isExported() && name !== undefined)
        exportNames.push(name);
    }
  }
  return { bindings, exportNames };
}

const CHECK_STATEMENT = /^const ([\w$]+): ([\w$]+)<typeof ([\w$]+)> = true;$/;

const CHECK_TYPE_IMPORT = `import type { SubgraphCheck } from "@powerhousedao/reactor-api";`;

// A host older than the subgraph protocol would serve these classes under the
// placeholder name of its own base class instead of refusing them.
const hostGuard = (local: string) =>
  `if (!(Symbol.for("powerhouse.subgraph") in ${local})) { throw new Error("This package's subgraphs need a newer host. Its @powerhousedao/reactor-api predates class-based subgraphs and would serve them under a placeholder name. Upgrade the host, or install a release of this package built for it."); }`;

const HOST_GUARD_STATEMENT =
  /^if \(!\(Symbol\.for\("powerhouse\.subgraph"\) in ([\w$]+)\)\)/;

const statementCommentAnchor = {
  checkType: "check-type",
  empty: "empty",
  hostGuard: "host-guard",
  import: (key: string) => `import:${key}`,
  export: (key: string) => `export:${key}`,
  check: (key: string) => `check:${key}`,
  void: (key: string) => `void:${key}`,
};

type Candidate = { readonly statement: Statement; readonly text: string } & (
  | { readonly kind: "check-type" | "empty" | "host-guard" }
  | {
      readonly kind: "import";
      readonly elements: readonly { key: string; local: string }[];
    }
  | {
      readonly kind: "export";
      readonly local: string;
      readonly exportName: string;
    }
  | { readonly kind: "check"; readonly check: string; readonly local: string }
  | { readonly kind: "void"; readonly check: string }
);

async function formatStatements(texts: readonly string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  const formatted = ts.createSourceFile(
    "index.ts",
    await formatSafe(texts.join("\n")),
    ts.ScriptTarget.ESNext,
  );
  return formatted.statements.map((statement) => statement.getText(formatted));
}

type Claim = readonly [statement: Statement, anchor: string];

type Ownership = {
  readonly anchors: ReadonlyMap<Statement, string>;
  readonly imports: ReadonlyMap<string, string>;
  readonly checks: ReadonlyMap<string, string>;
  readonly preserved: ReadonlyMap<string, PreservedNames>;
};

function claimOwnedStatements(
  generated: readonly Candidate[],
  statements: readonly Statement[],
  helperImports: readonly ImportDeclaration[],
): Ownership {
  const imports = claimImports(generated);
  const exportsAndChecks = claimExportsAndChecks(generated, imports.keyByLocal);
  const anchors = new Map([
    ...claimStandaloneStatements(generated),
    ...imports.claims,
    ...exportsAndChecks.claims,
    ...claimVoids(generated, exportsAndChecks.keyByCheck),
  ]);
  for (const statement of helperImports) {
    const named = statement.getNamedImports()[0];
    const binding = named.getAliasNode() ?? named.getNameNode();
    if (
      Node.isIdentifier(binding) &&
      hasAuthoredReference(binding, statements, anchors)
    )
      anchors.delete(statement);
  }
  const preserved = new Map<string, PreservedNames>();
  for (const [key, local] of imports.localByKey) preserved.set(key, { local });
  for (const [key, exportName] of exportsAndChecks.exportNameByKey)
    preserved.set(key, { ...preserved.get(key), exportName });
  return {
    anchors,
    imports: imports.keyByLocal,
    checks: exportsAndChecks.keyByCheck,
    preserved,
  };
}

function claimStandaloneStatements(generated: readonly Candidate[]): Claim[] {
  return generated.flatMap((candidate): Claim[] =>
    candidate.kind === "check-type"
      ? [[candidate.statement, statementCommentAnchor.checkType]]
      : candidate.kind === "empty"
        ? [[candidate.statement, statementCommentAnchor.empty]]
        : candidate.kind === "host-guard"
          ? [[candidate.statement, statementCommentAnchor.hostGuard]]
          : [],
  );
}

function claimImports(generated: readonly Candidate[]) {
  const claims: Claim[] = [];
  const keyByLocal = new Map<string, string>();
  const localByKey = new Map<string, string>();
  for (const candidate of generated) {
    if (candidate.kind !== "import") continue;
    claims.push([
      candidate.statement,
      statementCommentAnchor.import(candidate.elements[0].key),
    ]);
    for (const { key, local } of candidate.elements) {
      keyByLocal.set(local, key);
      localByKey.set(key, local);
    }
  }
  return { claims, keyByLocal, localByKey };
}

function claimExportsAndChecks(
  generated: readonly Candidate[],
  keyByImportLocal: ReadonlyMap<string, string>,
) {
  const claims: Claim[] = [];
  const keyByCheck = new Map<string, string>();
  const exportNameByKey = new Map<string, string>();
  for (const candidate of generated) {
    if (candidate.kind !== "export" && candidate.kind !== "check") continue;
    const key = keyByImportLocal.get(candidate.local);
    if (key === undefined) continue;
    if (candidate.kind === "export") {
      claims.push([candidate.statement, statementCommentAnchor.export(key)]);
      exportNameByKey.set(key, candidate.exportName);
    } else {
      claims.push([candidate.statement, statementCommentAnchor.check(key)]);
      keyByCheck.set(candidate.check, key);
    }
  }
  return { claims, keyByCheck, exportNameByKey };
}

function claimVoids(
  generated: readonly Candidate[],
  keyByCheck: ReadonlyMap<string, string>,
): Claim[] {
  return generated.flatMap((candidate): Claim[] => {
    if (candidate.kind !== "void") return [];
    const key = keyByCheck.get(candidate.check);
    return key === undefined
      ? []
      : [[candidate.statement, statementCommentAnchor.void(key)]];
  });
}

function hasAuthoredReference(
  name: Identifier,
  statements: readonly Statement[],
  owned: ReadonlyMap<Statement, string>,
): boolean {
  const root = name.getSourceFile();
  return name
    .findReferencesAsNodes()
    .some(
      (node) =>
        node.getSourceFile() === root &&
        statements.some(
          (statement) =>
            !owned.has(statement) &&
            node.getStart() >= statement.getStart() &&
            node.getEnd() <= statement.getEnd(),
        ),
    );
}

async function readRootLayout(
  root: SourceFile,
  subgraphsDir: string,
  classes: readonly SubgraphClass[],
  requireClassExports: ReadonlySet<string> = new Set(),
): Promise<RootLayout> {
  const rootPath = root.getFilePath();
  const classesByFile = new Map<string, Set<string>>();
  for (const { file, importName } of classes)
    classesByFile.set(
      file,
      (classesByFile.get(file) ?? new Set()).add(importName),
    );
  const specifierOf = new Map(
    classes.map(({ file, importName, moduleSpecifier }) => [
      classKey(file, importName),
      moduleSpecifier,
    ]),
  );
  const moduleOf = (specifier: string | undefined) =>
    subgraphFileOfSpecifier(subgraphsDir, rootPath, specifier);

  const statements = root.getStatements();
  const candidates: Candidate[] = [];
  const classImports = new Map<string, string>();
  const helperImports = root
    .getImportDeclarations()
    .filter(
      (statement) =>
        statement.isTypeOnly() &&
        statement.getModuleSpecifierValue() === "@powerhousedao/reactor-api" &&
        statement.getNamedImports().length === 1 &&
        statement.getNamedImports()[0].getName() === "SubgraphCheck",
    );
  const helperNames = new Set([
    "SubgraphCheck",
    ...helperImports.map((statement) => {
      const named = statement.getNamedImports()[0];
      return named.getAliasNode()?.getText() ?? named.getName();
    }),
  ]);
  for (const statement of statements) {
    const text = statement.getText();
    if (Node.isImportDeclaration(statement)) {
      if (helperImports.includes(statement)) {
        const named = statement.getNamedImports()[0];
        const alias = named.getAliasNode()?.getText();
        candidates.push({
          statement,
          text:
            alias === undefined
              ? CHECK_TYPE_IMPORT
              : `import type { SubgraphCheck as ${alias} } from "@powerhousedao/reactor-api";`,
          kind: "check-type",
        });
        continue;
      }
      const specifier = statement.getModuleSpecifierValue();
      const file = moduleOf(specifier);
      if (file === undefined) continue;
      const named = statement.getNamedImports();
      const elements = named.map((element) => ({
        importName: element.getName(),
        local: element.getAliasNode()?.getText() ?? element.getName(),
        key: classKey(file, element.getName()),
      }));
      if (
        elements.length > 0 &&
        !statement.getDefaultImport() &&
        !statement.getNamespaceImport() &&
        elements.every(
          ({ key }) =>
            generatedSubgraphSpecifier(
              file,
              specifier,
              specifierOf.get(key),
            ) === specifier,
        )
      ) {
        const names = elements.map(({ importName, local }) =>
          local === importName ? importName : `${importName} as ${local}`,
        );
        candidates.push({
          statement,
          kind: "import",
          elements,
          text: `import { ${names.join(", ")} } from "${specifier}";`,
        });
      }
      for (const element of named) {
        if (statement.isTypeOnly() || element.isTypeOnly()) continue;
        classImports.set(
          element.getAliasNode()?.getText() ?? element.getName(),
          classKey(file, element.getName()),
        );
      }
    } else if (
      Node.isExportDeclaration(statement) &&
      statement.getModuleSpecifier() === undefined
    ) {
      const named = statement.getNamedExports();
      if (named.length === 0) {
        candidates.push({ statement, text: "export {};", kind: "empty" });
      } else if (named.length === 1) {
        const local = named[0].getName();
        const exportName = named[0].getAliasNode()?.getText() ?? local;
        candidates.push({
          statement,
          kind: "export",
          local,
          exportName,
          text: `export { ${local === exportName ? local : `${local} as ${exportName}`} };`,
        });
      }
    } else if (Node.isVariableStatement(statement)) {
      const check = CHECK_STATEMENT.exec(
        text.replace(/\s+/g, " ").replace(/< /g, "<").replace(/ >/g, ">"),
      );
      if (
        check &&
        helperNames.has(check[2]) &&
        check[1].startsWith(`check${check[3]}`) &&
        /^(?:|[2-9][0-9]*|1[0-9]+)$/.test(
          check[1].slice(`check${check[3]}`.length),
        )
      )
        candidates.push({
          statement,
          kind: "check",
          check: check[1],
          local: check[3],
          text: `const ${check[1]}: ${check[2]}<typeof ${check[3]}> = true;`,
        });
    } else if (Node.isExpressionStatement(statement)) {
      const expression = statement.getExpression();
      if (
        Node.isVoidExpression(expression) &&
        Node.isIdentifier(expression.getExpression())
      ) {
        const check = expression.getExpression().getText();
        candidates.push({
          statement,
          kind: "void",
          check,
          text: `void ${check};`,
        });
      }
    } else if (Node.isIfStatement(statement)) {
      const guarded = HOST_GUARD_STATEMENT.exec(text)?.[1];
      if (guarded !== undefined)
        candidates.push({
          statement,
          kind: "host-guard",
          text: hostGuard(guarded),
        });
    }
  }

  const formatted = await formatStatements(candidates.map(({ text }) => text));
  const generated = candidates.filter(
    ({ statement }, index) => statement.getText() === formatted[index],
  );
  const ownership = claimOwnedStatements(generated, statements, helperImports);
  const owned = ownership.anchors;
  const covered = new Set<string>();
  for (const statement of statements) {
    if (
      owned.has(statement) ||
      !Node.isExportDeclaration(statement) ||
      statement.isTypeOnly()
    )
      continue;
    const specifier = statement.getModuleSpecifierValue();
    const named = statement.getNamedExports();
    const file = moduleOf(specifier);
    if (specifier === undefined) {
      for (const element of named) {
        if (element.isTypeOnly() || ownership.imports.has(element.getName()))
          continue;
        const key = classImports.get(element.getName());
        if (key !== undefined) covered.add(key);
      }
    } else if (file === undefined) {
      continue;
    } else if (named.length === 0) {
      for (const importName of classesByFile.get(file) ?? []) {
        const key = classKey(file, importName);
        if (!ownership.preserved.has(key) && !requireClassExports.has(file))
          covered.add(key);
      }
    } else {
      for (const element of named)
        if (
          !element.isTypeOnly() &&
          classesByFile.get(file)?.has(element.getName())
        )
          covered.add(classKey(file, element.getName()));
    }
  }

  const text = root.getFullText();
  const comments = new Map<string, string>();
  for (const [statement, key] of owned) {
    const comment = text
      .slice(statement.getFullStart(), statement.getStart())
      .replace(BANNER, "")
      .trim();
    if (comment !== "") comments.set(key, comment);
  }
  const authoredStatements = statements.filter(
    (statement) => !owned.has(statement),
  );
  const trailing = text.slice(statements.at(-1)?.getEnd() ?? 0);
  const authored = authoredStatements
    .map((statement) =>
      text.slice(statement.getFullStart(), statement.getEnd()),
    )
    .join("")
    .replace(BANNER, "");
  const { bindings, exportNames } = topLevelNames(authoredStatements);
  return {
    authored: authored.trim() === "" ? "" : authored,
    trailing,
    comments,
    hasOwned: owned.size > 0 || text.includes(BANNER),
    bindings: new Set(bindings),
    exportNames: new Set(exportNames),
    referenced: new Set(
      [...owned.keys()].flatMap((statement) => {
        const names = Node.isImportDeclaration(statement)
          ? statement
              .getNamedImports()
              .map((named) => named.getAliasNode() ?? named.getNameNode())
          : Node.isVariableStatement(statement)
            ? statement
                .getDeclarations()
                .map((declaration) => declaration.getNameNode())
            : [];
        return names
          .filter(Node.isIdentifier)
          .filter((name) => hasAuthoredReference(name, statements, owned))
          .map((name) => name.getText());
      }),
    ),
    ownedLocals: new Set([
      ...ownership.imports.keys(),
      ...ownership.checks.keys(),
    ]),
    covered,
    preserved: ownership.preserved,
  };
}

function unique(candidates: readonly string[], taken: Set<string>): string {
  const name =
    candidates.find((candidate) => !taken.has(candidate)) ??
    Array.from(
      { length: taken.size + 1 },
      (_, index) => `${candidates[0]}${index + 2}`,
    ).find((candidate) => !taken.has(candidate))!;
  taken.add(name);
  return name;
}

function allocateEntries(
  classes: readonly SubgraphClass[],
  layout: RootLayout,
  helper: string,
): BarrelEntry[] {
  const pending = classes.filter(
    ({ file, importName }) => !layout.covered.has(classKey(file, importName)),
  );
  const exportsTaken = new Set(layout.exportNames);
  const bindingsTaken = new Set([...layout.bindings, helper]);
  const claim = (taken: Set<string>, name: string | undefined) => {
    if (name === undefined || taken.has(name)) return undefined;
    taken.add(name);
    return name;
  };
  const preservedOf = ({ file, importName }: SubgraphClass) =>
    layout.preserved.get(classKey(file, importName));
  const exportNames = pending.map((subgraph) =>
    claim(exportsTaken, preservedOf(subgraph)?.exportName),
  );
  const exportNamesFor = pending.map(
    (subgraph, index) =>
      exportNames[index] ??
      unique(
        [
          subgraph.preferredName,
          pascalCase(
            subgraph.moduleSpecifier
              .slice(2)
              .replace(/\.m?js$/, "")
              .replace(/\/index$/, ""),
          ) + subgraph.preferredName,
        ],
        exportsTaken,
      ),
  );
  const locals = pending.map((subgraph) =>
    claim(bindingsTaken, preservedOf(subgraph)?.local),
  );
  const localsFor = pending.map(
    (_, index) =>
      locals[index] ?? unique([exportNamesFor[index]], bindingsTaken),
  );
  return pending.map((subgraph, index) => ({
    ...subgraph,
    exportName: exportNamesFor[index],
    local: localsFor[index],
    check: unique([`check${localsFor[index]}`], bindingsTaken),
  }));
}

async function renderBarrel(
  scratch: SourceFile,
  entries: readonly BarrelEntry[],
  layout: RootLayout,
  root: SourceFile,
  helper: string,
): Promise<string> {
  if (entries.length === 0 && layout.authored !== "") {
    if (!layout.hasOwned) return root.getFullText();
    const isModule =
      topLevelNames(root.getStatements()).exportNames.length > 0 ||
      root.getImportDeclarations().length > 0;
    return `${layout.authored.trim()}\n${isModule ? "" : "\nexport {};\n"}${layout.trailing.trimStart()}`;
  }
  scratch.replaceWithText(subgraphsIndexTemplate);
  if (entries.length > 0) {
    scratch
      .getExportDeclarations()
      .forEach((declaration) => declaration.remove());
    scratch.addImportDeclaration({
      moduleSpecifier: "@powerhousedao/reactor-api",
      isTypeOnly: true,
      namedImports: [
        helper === "SubgraphCheck"
          ? helper
          : { name: "SubgraphCheck", alias: helper },
      ],
    });
    for (const {
      importName,
      local,
      exportName,
      check,
      moduleSpecifier,
    } of entries) {
      scratch.addImportDeclaration({
        moduleSpecifier,
        namedImports: [
          local === importName
            ? importName
            : { name: importName, alias: local },
        ],
      });
      scratch.addExportDeclaration({
        namedExports: [
          local === exportName ? local : { name: local, alias: exportName },
        ],
      });
      scratch.addStatements(
        `const ${check}: ${helper}<typeof ${local}> = true;\nvoid ${check};`,
      );
    }
    scratch.insertStatements(
      scratch.getImportDeclarations().length,
      `\n${hostGuard(entries[0].local)}\n`,
    );
  }
  await formatSourceFileWithPrettier(scratch);
  attachComments(scratch, entries, layout.comments);
  const generated = scratch.getFullText();
  const trailing =
    layout.trailing.trim() === "" ? "" : layout.trailing.trimStart();
  if (layout.authored === "") return generated + trailing;
  const headerEnd = scratch.getImportDeclarations().at(-1)!.getEnd();
  return `${generated.slice(0, headerEnd)}\n\n${layout.authored.trim()}\n\n${generated.slice(headerEnd).trimStart()}${trailing}`;
}

function attachComments(
  scratch: SourceFile,
  entries: readonly BarrelEntry[],
  comments: ReadonlyMap<string, string>,
) {
  if (comments.size === 0) return;
  const byLocal = new Map(
    entries.map((entry) => [
      entry.local,
      classKey(entry.file, entry.importName),
    ]),
  );
  const byCheck = new Map(
    entries.map((entry) => [
      entry.check,
      classKey(entry.file, entry.importName),
    ]),
  );
  const commentAnchorOf = (statement: Statement): string | undefined => {
    if (Node.isImportDeclaration(statement)) {
      const [named] = statement.getNamedImports();
      if (statement.isTypeOnly()) return statementCommentAnchor.checkType;
      const key = byLocal.get(
        named.getAliasNode()?.getText() ?? named.getName(),
      );
      return key && statementCommentAnchor.import(key);
    }
    if (Node.isExportDeclaration(statement)) {
      const named = statement.getNamedExports().at(0);
      if (named === undefined) return statementCommentAnchor.empty;
      const key = byLocal.get(named.getName());
      return key && statementCommentAnchor.export(key);
    }
    if (Node.isVariableStatement(statement)) {
      const key = byCheck.get(statement.getDeclarations()[0].getName());
      return key && statementCommentAnchor.check(key);
    }
    if (Node.isIfStatement(statement)) return statementCommentAnchor.hostGuard;
    if (Node.isExpressionStatement(statement)) {
      const expression = statement.getExpression();
      const key =
        Node.isVoidExpression(expression) &&
        byCheck.get(expression.getExpression().getText());
      return key ? statementCommentAnchor.void(key) : undefined;
    }
    return undefined;
  };
  const unplaced = new Map(comments);
  let text = scratch.getFullText();
  for (const statement of scratch.getStatements().toReversed()) {
    const commentAnchorKeys =
      Node.isImportDeclaration(statement) && !statement.isTypeOnly()
        ? statement.getNamedImports().flatMap((named) => {
            const key = byLocal.get(
              named.getAliasNode()?.getText() ?? named.getName(),
            );
            return key === undefined
              ? []
              : [statementCommentAnchor.import(key)];
          })
        : [commentAnchorOf(statement)].filter(
            (key): key is string => key !== undefined,
          );
    const comment = commentAnchorKeys
      .flatMap((key) => (unplaced.has(key) ? [unplaced.get(key)!] : []))
      .join("\n");
    if (!comment) continue;
    for (const key of commentAnchorKeys) unplaced.delete(key);
    const start = statement.getStart();
    text = `${text.slice(0, start)}${comment}\n${text.slice(start)}`;
  }
  scratch.replaceWithText(text);
}

function validateBarrel(
  scratch: SourceFile,
  text: string,
  entries: readonly BarrelEntry[],
  layout: RootLayout,
  refuse: ReturnType<typeof refusal>,
  helper: string,
) {
  const syntaxError = firstSyntaxError(text);
  if (syntaxError !== undefined)
    refuse(
      "Regenerating subgraphs/index.ts would produce a file that does not parse.",
      syntaxError,
      "Report this to Powerhouse with the contents of subgraphs/index.ts.",
    );
  scratch.replaceWithText(text);
  const { bindings, exportNames } = topLevelNames(scratch.getStatements());
  const generatedBindings = new Set([
    ...entries.flatMap(({ local, check }) => [local, check]),
    ...(entries.length > 0 ? [helper] : []),
  ]);
  const generatedExports = new Set(entries.map(({ exportName }) => exportName));
  const twice = (names: readonly string[], generated: ReadonlySet<string>) =>
    names.find(
      (name, index) => generated.has(name) && names.indexOf(name) !== index,
    );
  const duplicate =
    twice(bindings, generatedBindings) ?? twice(exportNames, generatedExports);
  if (duplicate !== undefined)
    refuse(
      `Regenerating subgraphs/index.ts would declare ${duplicate} twice.`,
      undefined,
      `Rename ${duplicate} in subgraphs/index.ts, then run the generator again.`,
    );
  const bound = new Set(bindings);
  const dangling = [...layout.ownedLocals].find(
    (name) => layout.referenced.has(name) && !bound.has(name),
  );
  if (dangling !== undefined)
    refuse(
      `Regenerating subgraphs/index.ts would leave an authored reference to ${dangling} without its generated binding.`,
      undefined,
      `Import ${dangling} in your own statement in subgraphs/index.ts, or stop using it, then run the generator again.`,
    );
}
