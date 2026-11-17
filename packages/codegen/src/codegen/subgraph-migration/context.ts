/** The result types of a subgraph migration, its refusals, and the file helpers every step shares. */
import { Node, type Project, type SourceFile } from "ts-morph";
import { posix } from "node:path";

/** @experimental Why a subgraph directory was not converted, and how to fix it. */
export type SubgraphMigrationRefusal = {
  /** Project-relative path. */
  readonly file: string;
  readonly line: number;
  readonly reason: string;
  readonly repair: string;
};

/**
 * @experimental A file the conversion writes; `before` is null for a new
 * file, and `after` is null for a file it removes.
 */
export type SubgraphMigrationFile = {
  /** Project-relative path. */
  readonly path: string;
  readonly before: string | null;
  readonly after: string | null;
};

export const ROOT_KINDS = {
  Query: "query",
  Mutation: "mutation",
  Subscription: "subscription",
} as const;
export type RootName = keyof typeof ROOT_KINDS;
export const isRootName = (name: string): name is RootName =>
  Object.hasOwn(ROOT_KINDS, name);
export const BUILT_IN_SCALARS = new Set([
  "String",
  "Int",
  "Float",
  "Boolean",
  "ID",
]);
export const SCALARS_ENTRY = "scalars/index.ts";

export class Refused extends Error {
  constructor(
    readonly refusal: SubgraphMigrationRefusal,
    readonly noSubgraphClass = false,
  ) {
    super(refusal.reason);
  }
}

export function refuse(
  file: string,
  line: number,
  reason: string,
  repair: string,
): never {
  throw new Refused({ file, line, reason, repair });
}

export type SdlSource = {
  readonly file: string;
  readonly text: string;
  /** The line of `file` the SDL's first line is on. */
  readonly firstLine: number;
  /** Files of the directory besides index.ts that import schema.ts's SDL. */
  readonly sdlImporters?: readonly string[];
};

/** Where the schema-first SDL goes when other files of the directory import it. */
export const KEPT_SDL = "schema-sdl";

export type Input = {
  readonly dir: string;
  readonly files: ReadonlyMap<string, string>;
  /** Project-relative targets read from outside the directory or through project aliases. */
  readonly importedFromOutside?: ReadonlySet<string>;
  /** Those of `importedFromOutside` read whole; absent, all of them. */
  readonly readWholeFromOutside?: ReadonlySet<string>;
};

export function sourceFile(
  project: Project,
  input: Input,
  path: string,
): SourceFile {
  const existing = project.getSourceFile(`/${path}`);
  if (existing !== undefined) return existing;
  const text = input.files.get(path);
  if (text === undefined) {
    refuse(path, 1, `${path} does not exist.`, "Restore the file.");
  }
  return project.createSourceFile(`/${path}`, text);
}

export const lineOf = (node: Node) => node.getStartLineNumber();

export function unwrap(node: Node): Node {
  let current = node;
  while (
    Node.isParenthesizedExpression(current) ||
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

/** The binding an identifier names in `file`, when an import declares it. */
export function importOf(file: SourceFile, name: string) {
  for (const declaration of file.getImportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    const defaultImport = declaration.getDefaultImport();
    if (defaultImport?.getText() === name) {
      return { declaration, specifier, imported: "default" };
    }
    for (const named of declaration.getNamedImports()) {
      if ((named.getAliasNode() ?? named.getNameNode()).getText() === name) {
        return {
          declaration,
          specifier,
          imported: named.getName(),
          typeOnly: declaration.isTypeOnly() || named.isTypeOnly(),
        };
      }
    }
  }
  return undefined;
}

/**
 * The project path a relative import in `fromDir` names: `./schema.js` and
 * `./schema` name `schema.ts`; `./resolvers/index.js` and `./resolvers`
 * name `resolvers/index.ts`. A package specifier names none.
 */
export function localModule(
  files: ReadonlyMap<string, string>,
  fromDir: string,
  specifier: string,
): string | undefined {
  if (!specifier.startsWith("./") && !specifier.startsWith("../")) {
    return undefined;
  }
  const base = posix.join(fromDir, specifier).replace(/\.[cm]?[jt]s$/, "");
  const candidates = [`${base}.ts`, `${base}/index.ts`];
  return candidates.find((path) => files.has(path)) ?? candidates[0];
}

/** Conservatively match complete reader paths, including package and alias paths under subgraphs/. */
export function readerTargets(
  files: ReadonlyMap<string, string>,
  fromDir: string,
  specifier: string,
): readonly string[] {
  // A leading # belongs to a package imports alias, not a URL fragment.
  const raw = specifier.slice(0, 1) + specifier.slice(1).split(/[?#]/, 1)[0];
  const paths = new Set([raw]);
  try {
    paths.add(decodeURIComponent(raw));
  } catch {
    // A non-URL literal can still name a file containing a percent character.
  }
  const targets: string[] = [];
  for (const path of paths) {
    const local = localModule(files, fromDir, path);
    if (local !== undefined) targets.push(local);
    else
      for (const match of path.matchAll(/subgraphs\//g)) {
        const target = localModule(files, ".", `./${path.slice(match.index)}`);
        if (target !== undefined) targets.push(target);
      }
  }
  return targets;
}

export function stringValue(node: Node | undefined): string | undefined {
  if (node === undefined) return undefined;
  const value = unwrap(node);
  return Node.isStringLiteral(value) ||
    Node.isNoSubstitutionTemplateLiteral(value)
    ? value.getLiteralValue()
    : undefined;
}

/** `text` with the line ending of the first line of `like`. */
export function withLineEndings(text: string, like: string | null): string {
  return like !== null && /\r?\n/.exec(like)?.[0] === "\r\n"
    ? text.replace(/\r?\n/g, "\r\n")
    : text;
}

export const dirnameOf = (path: string) => path.slice(0, path.lastIndexOf("/"));

export const sortedUnique = (names: Iterable<string>) =>
  [...new Set(names)].sort();
