import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { ts, type Project } from "ts-morph";

/** @experimental How a `subgraphs/<dir>/` is authored: a `Subgraph` class, or SDL and a `BaseSubgraph`. */
export type SubgraphStyle = "code-first" | "schema-first";

export type ReadSourceText = (path: string) => string | undefined;

export function readSourceTextFromDisk(path: string): string | undefined {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

export function projectSourceText(project: Project): ReadSourceText {
  const fileSystem = project.getFileSystem();
  return (path) => {
    const sourceFile = project.getSourceFile(path);
    if (sourceFile && !sourceFile.isSaved()) return sourceFile.getFullText();
    return fileSystem.fileExistsSync(path)
      ? fileSystem.readFileSync(path)
      : undefined;
  };
}

const hasModifier = (node: ts.HasModifiers, kind: ts.SyntaxKind) =>
  ts.getModifiers(node)?.some((modifier) => modifier.kind === kind) ?? false;

/** Where a relative specifier lands, as bundler resolution finds a `.ts` source. */
function resolveRelative(from: string, specifier: string): string[] {
  const target = resolve(dirname(from), specifier);
  const base = target.replace(/\.[cm]?jsx?$/, "");
  return [
    ...(/\.[cm]?tsx?$/.test(target) ? [target] : []),
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.mts`,
    join(target, "index.ts"),
  ];
}

/**
 * Follows `extends` clauses through parsed source. A class is code first when
 * it extends `Subgraph` imported from reactor-api (named, aliased or through a
 * namespace), or a class that a relative module inside the package (the
 * parent of `subgraphsDir`) exports and that is itself code first. Comments,
 * strings, type-only imports and imports that are never extended do not
 * count. Nothing is run or resolved through `node_modules`.
 */
class ExtendsChain {
  readonly #root: string;
  readonly #read: ReadSourceText;
  readonly #sources = new Map<string, ts.SourceFile | undefined>();
  readonly #visiting = new Set<string>();

  constructor(subgraphsDir: string, read: ReadSourceText) {
    this.#root = dirname(resolve(subgraphsDir));
    this.#read = read;
  }

  source(file: string): ts.SourceFile | undefined {
    if (!this.#sources.has(file)) {
      const text = this.#read(file);
      this.#sources.set(
        file,
        text === undefined
          ? undefined
          : ts.createSourceFile(file, text, ts.ScriptTarget.Latest),
      );
    }
    return this.#sources.get(file);
  }

  isCodeFirstClass(file: string, declaration: ts.ClassLikeDeclaration) {
    const extended = declaration.heritageClauses?.find(
      (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
    )?.types[0]?.expression;
    return extended !== undefined && this.#isCodeFirstValue(file, extended);
  }

  #guardCycle(key: string, ask: () => boolean) {
    if (this.#visiting.has(key)) return false;
    this.#visiting.add(key);
    try {
      return ask();
    } finally {
      this.#visiting.delete(key);
    }
  }

  #isCodeFirstValue(file: string, extended: ts.Expression): boolean {
    let expression = extended;
    while (
      ts.isParenthesizedExpression(expression) ||
      ts.isAsExpression(expression) ||
      ts.isSatisfiesExpression(expression) ||
      ts.isNonNullExpression(expression)
    ) {
      expression = expression.expression;
    }
    if (ts.isIdentifier(expression)) {
      return this.#isCodeFirstBinding(file, expression.text);
    }
    if (
      ts.isPropertyAccessExpression(expression) &&
      ts.isIdentifier(expression.expression)
    ) {
      const namespace = this.#namespaceImport(file, expression.expression.text);
      return (
        namespace !== undefined &&
        this.#isCodeFirstImport(file, namespace, expression.name.text)
      );
    }
    return false;
  }

  #namespaceImport(file: string, local: string): string | undefined {
    for (const statement of this.source(file)?.statements ?? []) {
      if (
        ts.isImportDeclaration(statement) &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        statement.importClause !== undefined &&
        !statement.importClause.isTypeOnly &&
        statement.importClause.namedBindings !== undefined &&
        ts.isNamespaceImport(statement.importClause.namedBindings) &&
        statement.importClause.namedBindings.name.text === local
      ) {
        return statement.moduleSpecifier.text;
      }
    }
    return undefined;
  }

  #isCodeFirstBinding(file: string, local: string): boolean {
    return this.#guardCycle(`${file}\0local\0${local}`, () => {
      for (const statement of this.source(file)?.statements ?? []) {
        if (ts.isClassDeclaration(statement) && statement.name?.text === local)
          return this.isCodeFirstClass(file, statement);
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier) ||
          statement.importClause === undefined ||
          statement.importClause.isTypeOnly
        )
          continue;
        const specifier = statement.moduleSpecifier.text;
        const { name, namedBindings } = statement.importClause;
        if (name?.text === local)
          return this.#isCodeFirstImport(file, specifier, "default");
        if (namedBindings === undefined || !ts.isNamedImports(namedBindings))
          continue;
        const element = namedBindings.elements.find(
          (candidate) => candidate.name.text === local,
        );
        if (element === undefined) continue;
        return (
          !element.isTypeOnly &&
          this.#isCodeFirstImport(
            file,
            specifier,
            (element.propertyName ?? element.name).text,
          )
        );
      }
      return false;
    });
  }

  #isCodeFirstImport(file: string, specifier: string, name: string): boolean {
    if (specifier === REACTOR_API_PACKAGE) return name === "Subgraph";
    if (!specifier.startsWith(".")) return false;
    const target = resolveRelative(file, specifier).find(
      (candidate) =>
        this.#inside(candidate) && this.source(candidate) !== undefined,
    );
    return target !== undefined && this.#isCodeFirstExport(target, name);
  }

  #isCodeFirstExport(file: string, name: string): boolean {
    return this.#guardCycle(`${file}\0export\0${name}`, () => {
      for (const statement of this.source(file)?.statements ?? []) {
        if (
          ts.isClassDeclaration(statement) &&
          hasModifier(statement, ts.SyntaxKind.ExportKeyword)
        ) {
          const exported = hasModifier(statement, ts.SyntaxKind.DefaultKeyword)
            ? "default"
            : statement.name?.text;
          if (exported === name) return this.isCodeFirstClass(file, statement);
        } else if (
          ts.isExportAssignment(statement) &&
          !statement.isExportEquals &&
          name === "default"
        ) {
          return this.#isCodeFirstValue(file, statement.expression);
        } else if (ts.isExportDeclaration(statement) && !statement.isTypeOnly) {
          const specifier =
            statement.moduleSpecifier !== undefined &&
            ts.isStringLiteral(statement.moduleSpecifier)
              ? statement.moduleSpecifier.text
              : undefined;
          const clause = statement.exportClause;
          if (clause === undefined) {
            // `export * from` never re-exports a default.
            if (
              specifier !== undefined &&
              name !== "default" &&
              this.#isCodeFirstImport(file, specifier, name)
            )
              return true;
            continue;
          }
          if (!ts.isNamedExports(clause)) continue;
          const element = clause.elements.find(
            (candidate) => candidate.name.text === name,
          );
          if (element === undefined || element.isTypeOnly) continue;
          const local = (element.propertyName ?? element.name).text;
          return specifier === undefined
            ? this.#isCodeFirstBinding(file, local)
            : this.#isCodeFirstImport(file, specifier, local);
        }
      }
      return false;
    });
  }

  isCodeFirstExport(file: string, name: string): boolean {
    return this.#isCodeFirstExport(file, name);
  }

  /** The value names `file` re-exports, through `export { … }` and `export * from` modules inside the root. */
  reexportedNames(file: string): string[] {
    return this.#reexportedNames(file, new Set());
  }

  #reexportedNames(file: string, seen: Set<string>): string[] {
    if (seen.has(file)) return [];
    seen.add(file);
    return (this.source(file)?.statements ?? []).flatMap((statement) => {
      if (!ts.isExportDeclaration(statement) || statement.isTypeOnly) return [];
      const clause = statement.exportClause;
      if (clause !== undefined) {
        return ts.isNamedExports(clause)
          ? clause.elements
              .filter((element) => !element.isTypeOnly)
              .map((element) => element.name.text)
          : [];
      }
      const specifier = statement.moduleSpecifier;
      if (
        specifier === undefined ||
        !ts.isStringLiteral(specifier) ||
        !specifier.text.startsWith(".")
      )
        return [];
      const target = resolveRelative(file, specifier.text).find(
        (candidate) =>
          this.#inside(candidate) && this.source(candidate) !== undefined,
      );
      if (target === undefined) return [];
      return [
        ...(this.source(target)?.statements ?? []).flatMap((inner) =>
          ts.isClassDeclaration(inner) &&
          hasModifier(inner, ts.SyntaxKind.ExportKeyword) &&
          !hasModifier(inner, ts.SyntaxKind.DefaultKeyword) &&
          inner.name !== undefined
            ? [inner.name.text]
            : [],
        ),
        ...this.#reexportedNames(target, seen),
      ].filter((name) => name !== "default");
    });
  }

  #inside(path: string) {
    const rel = relative(this.#root, path);
    return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
  }
}

/**
 * The code-first classes `file` declares or re-exports from a module inside
 * the package, by name; an anonymous `export default class` has no name.
 * The parent of `subgraphsDir` bounds the relative modules followed.
 */
export function codeFirstClasses(
  file: string,
  subgraphsDir: string,
  read: ReadSourceText = readSourceTextFromDisk,
): { readonly name: string | undefined }[] {
  const chain = new ExtendsChain(subgraphsDir, read);
  const path = resolve(file);
  const declared = (chain.source(path)?.statements ?? []).flatMap(
    (statement) =>
      ts.isClassDeclaration(statement) &&
      chain.isCodeFirstClass(path, statement)
        ? [{ name: statement.name?.text }]
        : [],
  );
  const reexported = [...new Set(chain.reexportedNames(path))]
    .filter(
      (name) =>
        !declared.some((entry) => entry.name === name) &&
        chain.isCodeFirstExport(path, name),
    )
    .map((name) => ({ name }));
  return [...declared, ...reexported];
}

/**
 * @experimental The style of `subgraphs/<dirName>/`: code first when its
 * `index.ts` declares or re-exports a class whose `extends` chain reaches
 * reactor-api's `Subgraph`, schema first otherwise.
 */
export function subgraphDirStyle(
  subgraphsDir: string,
  dirName: string,
  read: ReadSourceText = readSourceTextFromDisk,
): SubgraphStyle {
  return codeFirstClasses(
    join(subgraphsDir, dirName, "index.ts"),
    subgraphsDir,
    read,
  ).length > 0
    ? "code-first"
    : "schema-first";
}

/**
 * @experimental Each `subgraphs/<dir>/` on disk that holds an `index.ts`,
 * sorted by name, with its style.
 */
export function subgraphDirStyles(
  subgraphsDir: string,
): { readonly dirName: string; readonly style: SubgraphStyle }[] {
  if (
    !(statSync(subgraphsDir, { throwIfNoEntry: false })?.isDirectory() ?? false)
  )
    return [];
  return readdirSync(subgraphsDir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        (statSync(join(subgraphsDir, entry.name, "index.ts"), {
          throwIfNoEntry: false,
        })?.isFile() ??
          false),
    )
    .map(({ name }) => name)
    .sort()
    .map((dirName) => ({
      dirName,
      style: subgraphDirStyle(subgraphsDir, dirName),
    }));
}
