/** Resolving and rewriting module specifiers when files are removed, replaced or moved. */
import { posix } from "node:path";
import {
  type CallExpression,
  type ExportDeclaration,
  type Identifier,
  type ImportDeclaration,
  Node,
  type NoSubstitutionTemplateLiteral,
  Project,
  QuoteKind,
  type SourceFile,
  type StringLiteral,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import {
  CODE_FILE,
  type Input,
  isPropertyName,
  literal,
  type ModelsLayout,
  sourceFile,
  unwrapExpression,
} from "./context.js";

/** A module name written as a string or a template literal without substitutions. */
type ModuleLiteral = StringLiteral | NoSubstitutionTemplateLiteral;

const isModuleLiteral = (node: Node): node is ModuleLiteral =>
  Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node);

export const stripExtension = (path: string) =>
  path.replace(/\.(?:[cm]?[jt]sx?|d\.ts)$/, "");

/** Whether a specifier's path, before any query or fragment, is percent-encoded. */
const encoded = (specifier: string) =>
  specifier
    .slice(0, specifier.length - suffixOf(specifier).length)
    .includes("%");

/** A specifier's query or fragment, such as `?raw` or `#hash`, which names no part of the path. */
const suffixOf = (specifier: string) => /[?#].*$/s.exec(specifier)?.[0] ?? "";

/**
 * A specifier's path as the loader reads it: percent-encoding decoded, as
 * native ESM resolves a relative URL. An encoded `/` or `\\` stays encoded,
 * as the loader rejects it.
 */
function decodedPath(path: string): string {
  if (!path.includes("%") || /%2f|%5c/i.test(path)) return path;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** The bare specifier of `layout`'s aliases that `specifier` starts with. */
const aliasOf = (layout: ModelsLayout, specifier: string) =>
  layout.aliases.find(
    (alias) => specifier === alias || specifier.startsWith(`${alias}/`),
  );

/** The project file a specifier names from `fromFile`, if it is one of `files`. */
export function resolveSpecifier(
  files: ReadonlyMap<string, string>,
  layout: ModelsLayout,
  fromFile: string,
  written: string,
): string | undefined {
  const path = written.slice(0, written.length - suffixOf(written).length);
  // A CommonJS require reads a percent sign as part of the file name, and
  // native ESM decodes it, so both spellings are tried.
  for (const specifier of new Set([path, decodedPath(path)])) {
    const target = resolvePath(files, layout, fromFile, specifier);
    if (target !== undefined) return target;
  }
  return undefined;
}

function resolvePath(
  files: ReadonlyMap<string, string>,
  layout: ModelsLayout,
  fromFile: string,
  specifier: string,
): string | undefined {
  let base: string;
  // `.` and `..` name a directory's index, as `./` and `../` do.
  if (/^\.\.?(?:\/|$)/.test(specifier)) {
    base = posix.normalize(posix.join(posix.dirname(fromFile), specifier));
  } else {
    const alias = aliasOf(layout, specifier);
    if (alias === undefined) return undefined;
    base = posix.normalize(
      `${layout.modelsDir}${specifier.slice(alias.length)}`,
    );
  }
  // A directory named with a trailing slash, such as `./gen/`, is its index.
  base = base.replace(/\/+$/, "");
  const stem = stripExtension(base);
  // `.mjs` and `.cjs` name themselves when they exist, as the loader reads
  // that file, or else the `.mts` and `.cts` sources they compile from; never
  // a `.ts` file of the same name.
  const kind = /\.([cm])js$/.exec(base)?.[1];
  const candidates =
    kind === undefined
      ? [
          `${stem}.ts`,
          `${stem}.tsx`,
          `${base}/index.ts`,
          `${base}/index.tsx`,
          // A file named with its own extension, such as the stored <name>.json.
          base,
        ]
      : [base, `${stem}.${kind}ts`];
  for (const candidate of candidates) {
    if (files.has(candidate)) return candidate;
  }
  return undefined;
}

/**
 * A relative specifier for `target`, keeping `written`'s query or fragment.
 * An alias for the old file does not establish a mapping for its replacement.
 */
export function specifierFor(
  fromFile: string,
  target: string,
  written: string,
): string {
  const suffix = suffixOf(written);
  const original = written.slice(0, written.length - suffix.length);
  return `${pathFor(fromFile, target, original)}${suffix}`;
}

function pathFor(fromFile: string, target: string, original: string): string {
  const keepsExtension = /\.[cm]?[jt]sx?$/.test(original);
  let relative = posix.relative(posix.dirname(fromFile), target);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  const stem = stripExtension(relative);
  return keepsExtension || !original.startsWith(".")
    ? `${stem}${emittedExtension(target)}`
    : stem;
}

/** The extension a file is loaded by once compiled: `.mts` runs as `.mjs`. */
function emittedExtension(path: string): string {
  if (/\.m[jt]s$/.test(path)) return ".mjs";
  if (/\.c[jt]s$/.test(path)) return ".cjs";
  return ".js";
}

/**
 * A value a file the model loads imports from a compatibility barrel: the
 * barrel reads the model's family when it loads, so that import is a cycle.
 * A name used only as a type is erased and is no cycle.
 */
export function compatValueImport(
  files: ReadonlyMap<string, string>,
  layout: ModelsLayout,
  root: string,
) {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of files) {
    const loaded =
      CODE_FILE.test(path) &&
      (/^v\d+\//.test(path.slice(root.length + 1)) ||
        path.startsWith(`${root}/upgrades/`)) &&
      !path.includes("/tests/");
    if (!loaded) continue;
    const file = project.createSourceFile(`/${path}`, text, {
      overwrite: true,
    });
    for (const declaration of file.getImportDeclarations()) {
      if (declaration.isTypeOnly()) continue;
      const specifier = declaration.getModuleSpecifierValue();
      const target = resolveSpecifier(files, layout, path, specifier);
      if (
        target === undefined ||
        !/\/compat\/v\d+\/(?:index|hooks)\.tsx?$/.test(target) ||
        !target.startsWith(`${root}/`)
      ) {
        continue;
      }
      const locals = [
        ...declaration
          .getNamedImports()
          .filter((named) => !named.isTypeOnly())
          .map((named) =>
            (named.getAliasNode() ?? named.getNameNode()).getText(),
          ),
        declaration.getNamespaceImport()?.getText(),
        declaration.getDefaultImport()?.getText(),
      ].filter((name): name is string => name !== undefined);
      for (const name of locals) {
        const value = file
          .getDescendantsOfKind(SyntaxKind.Identifier)
          .find(
            (identifier) =>
              identifier.getText() === name &&
              identifier.getFirstAncestorByKind(
                SyntaxKind.ImportDeclaration,
              ) === undefined &&
              identifier.getFirstAncestor((node) => Node.isTypeNode(node)) ===
                undefined &&
              !isPropertyName(identifier),
          );
        if (value !== undefined) {
          return {
            file: path,
            line: value.getStartLineNumber(),
            name,
            from: specifier,
          };
        }
      }
    }
  }
  return undefined;
}

/** The barrels codegen writes; ph migrate regenerates them after converting. */
export const BARRELS = new Set([
  "document-models/index.ts",
  "document-models/document-models.ts",
  "document-models/upgrade-manifests.ts",
]);

/**
 * Which names files outside the model's generated code import from it. A
 * namespace import or an `export *` of it counts as importing every name.
 */
export function importedModelNames(
  project: Project,
  input: Input,
  root: string,
): (name: string) => boolean {
  const names = new Set<string>();
  let all = false;
  const generated = (path: string) =>
    /\/v\d+\/(?:gen\/|module\.ts$|actions\.ts$|utils\.ts$|index\.ts$)/.test(
      path,
    ) || path === `${root}/index.ts`;
  for (const [path, text] of input.files) {
    if (
      !CODE_FILE.test(path) ||
      (path.startsWith(`${root}/`) && generated(path))
    ) {
      continue;
    }
    if (!text.includes(input.dirName) && !path.startsWith(`${root}/`)) continue;
    const file = sourceFile(project, input, path);
    for (const declaration of [
      ...file.getImportDeclarations(),
      ...file.getExportDeclarations(),
    ]) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined) continue;
      const target = resolveSpecifier(input.files, input, path, specifier);
      if (
        target === undefined ||
        !target.startsWith(`${root}/`) ||
        !generated(target)
      ) {
        continue;
      }
      if (Node.isImportDeclaration(declaration)) {
        if (declaration.getNamespaceImport() !== undefined) all = true;
        for (const named of declaration.getNamedImports())
          names.add(named.getName());
      } else if (declaration.getNamedExports().length === 0) {
        all = true;
      } else {
        for (const named of declaration.getNamedExports())
          names.add(named.getName());
      }
    }
  }
  return (name) => all || names.has(name);
}

/** Merges named imports of one specifier, as the rewrite can split a file's import in two. */
export function mergeImports(file: SourceFile) {
  const first = new Map<string, ImportDeclaration>();
  for (const declaration of file.getImportDeclarations()) {
    if (
      declaration.getDefaultImport() !== undefined ||
      declaration.getNamespaceImport() !== undefined ||
      declaration.getNamedImports().length === 0
    ) {
      continue;
    }
    const key = `${declaration.isTypeOnly() ? "type " : ""}${declaration.getModuleSpecifierValue()}`;
    const earlier = first.get(key);
    if (earlier === undefined) {
      first.set(key, declaration);
      continue;
    }
    const names = new Set(
      earlier.getNamedImports().map((named) => named.getText()),
    );
    for (const named of declaration.getNamedImports()) {
      if (!names.has(named.getText())) earlier.addNamedImport(named.getText());
    }
    declaration.remove();
  }
}

/** The key of the file that provides every name a deleted file exported. */
export const WHOLE = "*";

/** Where an import of a whole deleted file goes: its declared whole home, or the one file all its names went to. */
export function wholeHome(
  homes: ReadonlyMap<string, string>,
): string | undefined {
  const whole = homes.get(WHOLE);
  if (whole !== undefined) return whole;
  const all = new Set(homes.values());
  return all.size === 1 ? [...all][0] : undefined;
}

/**
 * What happened to an old path the migration removes: its content moved
 * whole to another path, or it was replaced and each name it exported now
 * lives in the file `homes` names (and a whole-file import goes to `WHOLE`).
 */
export type Removal =
  | { readonly kind: "moved"; readonly to: string }
  | { readonly kind: "replaced"; readonly homes: ReadonlyMap<string, string> };

export const replaced = (
  homes: ReadonlyMap<string, string> = new Map(),
): Removal => ({
  kind: "replaced",
  homes,
});

export type Unresolved = {
  readonly file: string;
  readonly line: number;
  readonly name: string;
  readonly from: string;
  /**
   * The file loads the removed file with require, and what provides its names
   * now imports document-model, which only `import` can load.
   */
  readonly commonJs?: true;
  /**
   * The file mocks the removed file, and the mock cannot move: `unsafe`
   * when it would change what other importers get, `collides` when another
   * mock or unmock in the package would move to the same file.
   */
  readonly mocked?: "unsafe" | "collides";
  /** The colliding call is an unmock, not a mock. */
  readonly unmocks?: true;
  /**
   * A string the migration does not follow as a module name, such as a
   * mock target held in a variable or a mock through a namespace, names the
   * removed file.
   */
  readonly unfollowed?: true;
  /**
   * The specifier has a query or fragment, which would apply to the file
   * that replaces the removed one instead.
   */
  readonly suffixed?: true;
  /** The specifier names the removed file through percent-encoding. */
  readonly encoded?: true;
  readonly sideEffect?: true;
};

/**
 * Points every import and re-export of a deleted file at the file that now
 * provides each name. Returns the names nothing provides.
 */
export function rewriteImports(
  files: Map<string, string>,
  layout: ModelsLayout,
  universe: ReadonlyMap<string, string>,
  removals: ReadonlyMap<string, Removal>,
): Unresolved[] {
  const project = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { quoteKind: QuoteKind.Double },
    // Without allowJs, JavaScript files stay out of the program, and reading
    // a symbol inside one of their class bodies throws.
    compilerOptions: { allowJs: true },
  });
  const unresolved: Unresolved[] = [];
  /**
   * The mocks the package moves, by the file each moves to. A test run
   * registers the mocks of its setup files and test file together, so mocks
   * in different files can meet.
   */
  const movedMocks = new Map<string, MovedMock[]>();
  // A moved file's strings the migration does not follow keep their meaning
  // relative to where the file was.
  const movedFrom = new Map(
    [...removals].flatMap(([from, removal]) =>
      removal.kind === "moved" ? [[removal.to, from] as const] : [],
    ),
  );
  for (const [path, text] of files) {
    if (!CODE_FILE.test(path)) continue;
    // Codegen rewrites the document-models barrels from the models it finds.
    if (BARRELS.has(path)) continue;
    // A file with no relative path (`./`, `../`, or a bare "." or ".."),
    // alias or escape names no project file.
    if (
      !/\.\.?\/|["'`]\.\.?["'`]/.test(text) &&
      !layout.aliases.some((alias) => text.includes(alias)) &&
      !text.includes("\\")
    ) {
      continue;
    }
    const file = project.createSourceFile(`/${path}`, text, {
      overwrite: true,
    });
    // A .cts file compiles its imports to require.
    const commonJs = /\.c[jt]s$/.test(path);
    let changed = false;
    const declarations: (ImportDeclaration | ExportDeclaration)[] = [
      ...file.getImportDeclarations(),
      ...file.getExportDeclarations(),
    ];
    for (const declaration of declarations) {
      const specifier = declaration.getModuleSpecifierValue();
      if (specifier === undefined) continue;
      const target = resolveSpecifier(universe, layout, path, specifier);
      const removal = target === undefined ? undefined : removals.get(target);
      if (removal === undefined) continue;
      if (encoded(specifier)) {
        unresolved.push({
          file: path,
          line: declaration.getStartLineNumber(),
          name: "*",
          from: specifier,
          encoded: true,
        });
        continue;
      }
      if (removal.kind === "moved") {
        declaration.setModuleSpecifier(
          specifierFor(path, removal.to, specifier),
        );
        changed = true;
        continue;
      }
      // `?raw` or `?url` would load a different file than the one it named.
      if (suffixOf(specifier) !== "") {
        unresolved.push({
          file: path,
          line: declaration.getStartLineNumber(),
          name: "*",
          from: specifier,
          suffixed: true,
        });
        continue;
      }
      if (commonJs) {
        unresolved.push({
          file: path,
          line: declaration.getStartLineNumber(),
          name: "*",
          from: specifier,
          commonJs,
        });
        continue;
      }
      const { homes } = removal;
      const missing = (name: string) =>
        unresolved.push({
          file: path,
          line: declaration.getStartLineNumber(),
          name,
          from: specifier,
        });
      const singleHome = () => wholeHome(homes);
      const respecify = (home: string) => specifierFor(path, home, specifier);
      if (Node.isImportDeclaration(declaration)) {
        const named = declaration.getNamedImports();
        const namespace = declaration.getNamespaceImport();
        const defaultImport = declaration.getDefaultImport();
        if (defaultImport !== undefined) missing("default");
        if (namespace !== undefined) {
          const home = singleHome();
          if (home === undefined) missing("*");
          else declaration.setModuleSpecifier(respecify(home));
          changed = true;
          continue;
        }
        if (named.length === 0 && defaultImport === undefined) {
          if (declaration.isTypeOnly()) {
            declaration.remove();
            changed = true;
          } else {
            unresolved.push({
              file: path,
              line: declaration.getStartLineNumber(),
              name: "*",
              from: specifier,
              sideEffect: true,
            });
          }
          continue;
        }
        const groups = new Map<string, string[]>();
        for (const specifierNode of named) {
          const name = specifierNode.getName();
          const home = homes.get(name);
          if (home === undefined) {
            missing(name);
            continue;
          }
          const entry = specifierNode.getText();
          groups.set(home, [...(groups.get(home) ?? []), entry]);
        }
        const typeOnly = declaration.isTypeOnly();
        const index = declaration.getChildIndex();
        const entries = [...groups];
        entries.forEach(([home, specifiers], offset) => {
          file.insertStatements(
            index + 1 + offset,
            `import ${typeOnly ? "type " : ""}{ ${specifiers.join(", ")} } from ${literal(respecify(home))};`,
          );
        });
        declaration.remove();
        changed = true;
        continue;
      }
      const named = declaration.getNamedExports();
      if (named.length === 0) {
        const home = singleHome();
        if (home === undefined) missing("*");
        else declaration.setModuleSpecifier(respecify(home));
        changed = true;
        continue;
      }
      const groups = new Map<string, string[]>();
      for (const specifierNode of named) {
        const name = specifierNode.getName();
        const home = homes.get(name);
        if (home === undefined) {
          missing(name);
          continue;
        }
        groups.set(home, [
          ...(groups.get(home) ?? []),
          specifierNode.getText(),
        ]);
      }
      const typeOnly = declaration.isTypeOnly();
      const index = declaration.getChildIndex();
      [...groups].forEach(([home, specifiers], offset) => {
        file.insertStatements(
          index + 1 + offset,
          `export ${typeOnly ? "type " : ""}{ ${specifiers.join(", ")} } from ${literal(respecify(home))};`,
        );
      });
      declaration.remove();
      changed = true;
    }
    // Read before any is rewritten: a mock and the importActual inside it
    // name the same module.
    const called = new Map(
      calledSpecifiers(file).map(
        (literal) => [literal, literal.getLiteralValue()] as const,
      ),
    );
    const specifierOf = (literal: ModuleLiteral) =>
      called.get(literal) ?? literal.getLiteralValue();
    const origin = movedFrom.get(path) ?? path;
    for (const literal of unfollowedSpecifiers(file, called)) {
      const specifier = literal.getLiteralValue();
      // Only dots and slashes compared as text, such as `p.startsWith("./")`.
      if (/^[./]*$/.test(specifier) && comparedAsText(literal)) continue;
      // What the string names where the file was, and where it will be.
      const before = resolveSpecifier(universe, layout, origin, specifier);
      const after = resolveSpecifier(universe, layout, path, specifier);
      // A sibling that moves with the file is still named after the move.
      const moved = before === undefined ? undefined : removals.get(before);
      const follows =
        moved?.kind === "moved" &&
        resolveSpecifier(new Map([[moved.to, ""]]), layout, path, specifier) ===
          moved.to;
      const stale =
        !follows &&
        (before !== after ||
          [before, after].some(
            (target) => target !== undefined && removals.has(target),
          ));
      if (!stale) continue;
      unresolved.push({
        file: movedFrom.get(path) ?? path,
        line: literal.getStartLineNumber(),
        name: "*",
        from: specifier,
        unfollowed: true,
      });
    }
    for (const [literal, specifier] of called) {
      const target = resolveSpecifier(universe, layout, path, specifier);
      if (target === undefined) continue;
      const removal = removals.get(target);
      if (removal === undefined) continue;
      // `import("…").Name` in a type; it is erased, so it loads nothing.
      const typeQuery = literal
        .getParentIfKind(SyntaxKind.LiteralType)
        ?.getParentIfKind(SyntaxKind.ImportType);
      const call = callOf(literal);
      const required =
        Node.isExternalModuleReference(literal.getParent()) ||
        (call !== undefined && calleeName(call) === "require");
      if (
        removal.kind === "replaced" &&
        typeQuery === undefined &&
        (commonJs || required)
      ) {
        unresolved.push({
          file: path,
          line: literal.getStartLineNumber(),
          name: "*",
          from: specifier,
          commonJs: true,
        });
        continue;
      }
      if (encoded(specifier)) {
        unresolved.push({
          file: path,
          line: literal.getStartLineNumber(),
          name: "*",
          from: specifier,
          encoded: true,
        });
        continue;
      }
      if (removal.kind === "replaced" && suffixOf(specifier) !== "") {
        unresolved.push({
          file: path,
          line: literal.getStartLineNumber(),
          name: "*",
          from: specifier,
          suffixed: true,
        });
        continue;
      }
      const named = typeQuery?.getQualifier()?.getText().split(".")[0];
      // `typeof import("…").Name` names its export; only a bare one follows a mock.
      const mock =
        named === undefined ? enclosingMock(literal, specifierOf) : undefined;
      const home =
        removal.kind === "moved"
          ? removal.to
          : mock !== undefined
            ? mockedHome(mock, removal.homes, specifierOf)
            : ((named === undefined ? undefined : removal.homes.get(named)) ??
              wholeHome(removal.homes));
      if (home === undefined) {
        unresolved.push({
          file: path,
          line: literal.getStartLineNumber(),
          name: named ?? "*",
          from: specifier,
          ...(mock === undefined ? {} : { mocked: "unsafe" as const }),
        });
        continue;
      }
      // An unmock clears whatever mock its module has, so it counts as one.
      const registering = registeringCall(literal);
      if (registering !== undefined) {
        movedMocks.set(home, [
          ...(movedMocks.get(home) ?? []),
          {
            file: path,
            line: literal.getStartLineNumber(),
            from: specifier,
            mocked: target,
            unmocks: UNMOCK.test(calleeName(registering) ?? ""),
          },
        ]);
      }
      literal.setLiteralValue(specifierFor(path, home, specifier));
      changed = true;
    }
    if (changed) {
      mergeImports(file);
      files.set(path, file.getFullText());
    }
  }
  // A runner keeps one mock per module, so mocks of different modules moved
  // onto one file would leave only the last registered.
  for (const mocks of movedMocks.values()) {
    if (new Set(mocks.map(({ mocked }) => mocked)).size < 2) continue;
    for (const { file, line, from, unmocks } of mocks) {
      unresolved.push({
        file,
        line,
        name: "*",
        from,
        mocked: "collides",
        ...(unmocks ? { unmocks: true as const } : {}),
      });
    }
  }
  return unresolved;
}

type MovedMock = {
  readonly file: string;
  readonly line: number;
  readonly from: string;
  /** The project file the mock named before the migration. */
  readonly mocked: string;
  readonly unmocks: boolean;
};

/** Calls whose first argument names a module: `import()`, `require` and the test runners' mocks. */
const MODULE_CALLS =
  /^(?:import|require|(?:vi|vitest|jest)\.(?:mock|doMock|setMock|unmock|doUnmock|dontMock|importActual|importMock|requireActual|requireMock|createMockFromModule))$/;

/**
 * The string literals in `file` that name a module outside an import or
 * export declaration: module calls, `import x = require("…")` and
 * `import("…")` types.
 */
export function calledSpecifiers(file: SourceFile): ModuleLiteral[] {
  const requires = file
    .getDescendantsOfKind(SyntaxKind.ExternalModuleReference)
    .flatMap((reference) => {
      const expression = reference.getExpression();
      return expression !== undefined && Node.isStringLiteral(expression)
        ? [expression]
        : [];
    });
  const types = file
    .getDescendantsOfKind(SyntaxKind.ImportType)
    .flatMap((type) => {
      const argument = type.getArgument();
      const literal = Node.isLiteralTypeNode(argument)
        ? argument.getLiteral()
        : undefined;
      return literal !== undefined && Node.isStringLiteral(literal)
        ? [literal]
        : [];
    });
  const calls = file
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .flatMap((call) => {
      const argument = call.getArguments().at(0);
      const module =
        argument === undefined ? undefined : unwrapArgument(argument);
      if (module === undefined || !isModuleLiteral(module)) return [];
      return MODULE_CALLS.test(calleeName(call) ?? "") ? [module] : [];
    });
  return [...calls, ...requires, ...types];
}

// vitest exports its utilities as both `vi` and `vitest`.
/**
 * The strings in `file` the migration does not follow as module names:
 * every string or template literal outside an import or export declaration
 * and outside the module calls it rewrites, such as a path held in a
 * variable, passed through another call or `.call`, spread or chosen by a
 * condition. One naming a removed file would keep naming it, so the
 * migration refuses instead of guessing how the string is used.
 */
function unfollowedSpecifiers(
  file: SourceFile,
  called: ReadonlyMap<ModuleLiteral, string>,
): ModuleLiteral[] {
  return file.getDescendants().filter((node): node is ModuleLiteral => {
    if (!isModuleLiteral(node) || called.has(node)) return false;
    const parent = node.getParent();
    return !(
      Node.isImportDeclaration(parent) || Node.isExportDeclaration(parent)
    );
  });
}

const MOCK = /^(?:vi|vitest|jest)\.(?:mock|doMock|setMock)$/;
const UNMOCK = /^(?:vi|vitest|jest)\.(?:unmock|doUnmock|dontMock)$/;
const VITEST_ACTUAL = /^(?:vi|vitest)\.importActual$/;
const ACTUAL = /^(?:(?:vi|vitest)\.importActual|jest\.requireActual)$/;

/**
 * The `vi.mock` or `jest.mock` call that `literal` names the module of: the
 * mock itself, or, inside its factory, an `importActual`/`requireActual` or a
 * `typeof import()` of the same module.
 */
function enclosingMock(
  literal: ModuleLiteral,
  specifierOf: (literal: ModuleLiteral) => string,
): CallExpression | undefined {
  const registering = registeringCall(literal);
  if (registering !== undefined) {
    return MOCK.test(calleeName(registering) ?? "") ? registering : undefined;
  }
  const call = callOf(literal);
  const actual = call !== undefined && ACTUAL.test(calleeName(call) ?? "");
  const typeQuery = literal
    .getParentIfKind(SyntaxKind.LiteralType)
    ?.getParentIfKind(SyntaxKind.ImportType);
  if (!actual && typeQuery === undefined) return undefined;
  return literal
    .getAncestors()
    .filter(Node.isCallExpression)
    .find((ancestor) => {
      const target = mockTarget(ancestor);
      return (
        target !== undefined && specifierOf(target) === specifierOf(literal)
      );
    });
}

/**
 * The callee of `call` as `name` or `receiver.name`, however it is spaced,
 * commented, parenthesized, optionally chained or written as `receiver["name"]`,
 * with a receiver imported from a test framework under another name called
 * by the name it exports.
 */
function calleeName(call: CallExpression): string | undefined {
  const callee = unwrapExpression(call.getExpression());
  if (callee.getKind() === SyntaxKind.ImportKeyword) return "import";
  if (Node.isIdentifier(callee)) return callee.getText();
  let name: string;
  if (Node.isPropertyAccessExpression(callee)) {
    name = callee.getName();
  } else if (Node.isElementAccessExpression(callee)) {
    const key = callee.getArgumentExpression();
    const literal = key === undefined ? undefined : unwrapExpression(key);
    if (literal === undefined || !isModuleLiteral(literal)) return undefined;
    name = literal.getLiteralValue();
  } else {
    return undefined;
  }
  const receiver = unwrapExpression(callee.getExpression());
  return Node.isIdentifier(receiver)
    ? `${frameworkName(receiver) ?? receiver.getText()}.${name}`
    : undefined;
}

/**
 * The name a test framework exports `receiver` as when the file imports it
 * from that framework, such as `vi` for `v` in `import { vi as v } from "vitest"`.
 */
function frameworkName(receiver: Identifier): string | undefined {
  for (const declaration of receiver.getSymbol()?.getDeclarations() ?? []) {
    if (!Node.isImportSpecifier(declaration)) continue;
    const exported = declaration.getName();
    const module = declaration.getImportDeclaration().getModuleSpecifierValue();
    if (FRAMEWORKS.get(exported) === module) return exported;
  }
  return undefined;
}

/**
 * The mock or unmock that registers the module `literal` names:
 * `vi.mock("…")` or vitest's typed `vi.mock(import("…"))`, with any
 * parentheses or casts around either.
 */
function registeringCall(literal: ModuleLiteral): CallExpression | undefined {
  const call = callOf(literal);
  const owner =
    call !== undefined && calleeName(call) === "import" ? callOf(call) : call;
  return owner !== undefined && registeredModule(owner) === literal
    ? owner
    : undefined;
}

/** The literal naming the module `call` mocks, or undefined when it is no mock. */
function mockTarget(call: CallExpression): ModuleLiteral | undefined {
  return MOCK.test(calleeName(call) ?? "") ? registeredModule(call) : undefined;
}

/** The literal naming the module a mock or unmock `call` registers. */
function registeredModule(call: CallExpression): ModuleLiteral | undefined {
  const name = calleeName(call) ?? "";
  if (!MOCK.test(name) && !UNMOCK.test(name)) return undefined;
  const argument = call.getArguments().at(0);
  if (argument === undefined) return undefined;
  const first = unwrapArgument(argument);
  if (isModuleLiteral(first)) return first;
  if (!Node.isCallExpression(first) || calleeName(first) !== "import") {
    return undefined;
  }
  const imported = first.getArguments().at(0);
  const module = imported === undefined ? undefined : unwrapArgument(imported);
  return module !== undefined && isModuleLiteral(module) ? module : undefined;
}

/**
 * `node` without parentheses, casts or `await` around it. A module call
 * takes `await import("…")` as it takes `import("…")`, and `await` on a
 * string changes nothing.
 */
function unwrapArgument(node: Node): Node {
  let current = unwrapExpression(node);
  while (Node.isAwaitExpression(current)) {
    current = unwrapExpression(current.getExpression());
  }
  return current;
}

/** The call whose first argument is `node`, through any parentheses, casts or `await` around it. */
function callOf(node: Node): CallExpression | undefined {
  let argument = node;
  let parent = node.getParent();
  while (
    parent !== undefined &&
    !Node.isCallExpression(parent) &&
    unwrapArgument(parent) === node
  ) {
    argument = parent;
    parent = parent.getParent();
  }
  return parent !== undefined &&
    Node.isCallExpression(parent) &&
    parent.getArguments().at(0) === argument
    ? parent
    : undefined;
}

/**
 * Where a mock of a replaced file goes. Its names now live, with other
 * files' names, in the files `homes` names, so the mock moves only when its
 * factory keeps every name it does not replace and replaces only names the
 * mocked file exported. A replaced name the mocked file re-exported from
 * another generated file then also reaches code that imported it from that
 * file. One factory shape is accepted and anything else is refused: it
 * returns an object literal, directly or as the last statement after `const`
 * declarations, whose first and only spread is the mocked module (the
 * awaited `importOriginal()` or `vi.importActual()` of it, `jest.requireActual`
 * of it, or a `const` holding one that nothing else reads) and whose other
 * members are named properties.
 */
function mockedHome(
  mock: CallExpression,
  homes: ReadonlyMap<string, string>,
  specifierOf: (literal: ModuleLiteral) => string,
): string | undefined {
  const target = mockTarget(mock);
  const factory = mock.getArguments().at(1);
  if (
    target === undefined ||
    factory === undefined ||
    !(Node.isArrowFunction(factory) || Node.isFunctionExpression(factory))
  ) {
    return undefined;
  }
  const original = factory.getParameters().at(0)?.getName();
  /**
   * Whether `node` is the mocked module as it really is: the awaited
   * `importOriginal()` or `vi.importActual()`, or `jest.requireActual()`,
   * which is synchronous.
   */
  const loadsOriginal = (node: Node): boolean => {
    let value = Node.isExpression(node) ? unwrapExpression(node) : node;
    const awaited = Node.isAwaitExpression(value);
    if (Node.isAwaitExpression(value)) {
      value = unwrapExpression(value.getExpression());
    }
    if (!Node.isCallExpression(value)) return false;
    const callee = calleeName(value);
    if (original !== undefined && callee === original) {
      return awaited && value.getArguments().length === 0;
    }
    const argument = value.getArguments().at(0);
    return (
      ACTUAL.test(callee ?? "") &&
      awaited === VITEST_ACTUAL.test(callee ?? "") &&
      value.getArguments().length === 1 &&
      argument !== undefined &&
      isModuleLiteral(argument) &&
      specifierOf(argument) === specifierOf(target)
    );
  };

  // The loader is the original only while nothing rebinds it.
  if (
    original !== undefined &&
    factory
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .some(
        (identifier) =>
          identifier.getText() === original &&
          identifier !== factory.getParameters().at(0)?.getNameNode() &&
          identifier
            .getParentIfKind(SyntaxKind.CallExpression)
            ?.getExpression() !== identifier,
      )
  ) {
    return undefined;
  }
  if (!frameworkBindings(factory)) return undefined;
  const body = factory.getBody();
  let returned: Node;
  const originals = new Set<string>();
  if (Node.isBlock(body)) {
    const statements = body.getStatements();
    const last = statements.at(-1);
    if (last === undefined || !Node.isReturnStatement(last)) return undefined;
    for (const statement of statements.slice(0, -1)) {
      if (
        !Node.isVariableStatement(statement) ||
        statement.getDeclarationKind() !== VariableDeclarationKind.Const
      ) {
        return undefined;
      }
      for (const declaration of statement.getDeclarations()) {
        const initializer = declaration.getInitializer();
        if (initializer === undefined) return undefined;
        if (
          Node.isIdentifier(declaration.getNameNode()) &&
          loadsOriginal(initializer)
        ) {
          originals.add(declaration.getName());
        } else if (!runsNothing(initializer)) {
          return undefined;
        }
      }
    }
    const expression = last.getExpression();
    if (expression === undefined) return undefined;
    returned = expression;
  } else {
    returned = body;
  }
  const object = Node.isExpression(returned)
    ? unwrapExpression(returned)
    : returned;
  if (!Node.isObjectLiteralExpression(object)) return undefined;

  const names: string[] = [];
  let spreads = 0;
  for (const property of object.getProperties()) {
    if (Node.isSpreadAssignment(property)) {
      spreads++;
      const spread = unwrapExpression(property.getExpression());
      const name = Node.isIdentifier(spread) ? spread.getText() : undefined;
      const kept =
        name === undefined
          ? loadsOriginal(spread)
          : originals.has(name) &&
            // Read only here, so nothing changes it before the spread.
            factory
              .getDescendantsOfKind(SyntaxKind.Identifier)
              .filter((identifier) => identifier.getText() === name).length ===
              2;
      if (!kept || spreads > 1 || names.length > 0) return undefined;
      continue;
    }
    if (
      !(
        Node.isPropertyAssignment(property) ||
        Node.isShorthandPropertyAssignment(property) ||
        Node.isMethodDeclaration(property)
      ) ||
      Node.isComputedPropertyName(property.getNameNode())
    ) {
      return undefined;
    }
    // jest's marker for a partial ES module mock, not a name of the module.
    if (property.getName() !== "__esModule") names.push(property.getName());
  }
  if (spreads !== 1) return undefined;
  if (names.length === 0) return wholeHome(homes);
  const replaced = new Set(names.map((name) => homes.get(name)));
  const [home] = replaced;
  return replaced.size === 1 ? home : undefined;
}

const FRAMEWORKS: ReadonlyMap<string, string> = new Map([
  ["vi", "vitest"],
  ["vitest", "vitest"],
  ["jest", "@jest/globals"],
]);

/**
 * Whether every `vi.importActual`/`jest.requireActual` in `factory` calls the
 * test framework's: its receiver is the global, or an import from its
 * framework, never a binding the file or the factory declares.
 */
function frameworkBindings(factory: Node): boolean {
  return factory
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .every((call) => {
      if (!ACTUAL.test(calleeName(call) ?? "")) return true;
      const callee = call.getExpression();
      if (!Node.isPropertyAccessExpression(callee)) return false;
      const receiver = callee.getExpression();
      if (!Node.isIdentifier(receiver)) return false;
      const declarations = receiver.getSymbol()?.getDeclarations() ?? [];
      // A global, or an import from the framework under any name.
      return declarations.length === 0
        ? FRAMEWORKS.has(receiver.getText())
        : frameworkName(receiver) !== undefined &&
            declarations.every(Node.isImportSpecifier);
    });
}

/**
 * Whether evaluating `node` runs no code that could rebind or change
 * anything: functions it only defines, `vi.fn`/`jest.fn` and literals.
 */
export function runsNothing(node: Node): boolean {
  const isFunction = (candidate: Node) =>
    Node.isArrowFunction(candidate) ||
    Node.isFunctionExpression(candidate) ||
    Node.isMethodDeclaration(candidate);
  if (isFunction(node)) return true;
  /** Whether `descendant` runs when `node` is evaluated, not inside a function it defines. */
  const runs = (descendant: Node) => {
    let child = descendant;
    for (
      let current = descendant.getParent();
      current !== undefined && current !== node;
      current = current.getParent()
    ) {
      // A method's computed name is evaluated with the object, not when called.
      const computedName =
        Node.isMethodDeclaration(current) && current.getNameNode() === child;
      if (isFunction(current) && !computedName) return false;
      child = current;
    }
    return true;
  };
  return [node, ...node.getDescendants().filter(runs)].every((descendant) => {
    if (
      Node.isAwaitExpression(descendant) ||
      Node.isNewExpression(descendant) ||
      Node.isTaggedTemplateExpression(descendant) ||
      Node.isDeleteExpression(descendant) ||
      Node.isPostfixUnaryExpression(descendant)
    ) {
      return false;
    }
    if (Node.isPrefixUnaryExpression(descendant)) {
      const operator = descendant.getOperatorToken();
      return (
        operator !== SyntaxKind.PlusPlusToken &&
        operator !== SyntaxKind.MinusMinusToken
      );
    }
    if (Node.isBinaryExpression(descendant)) {
      const operator = descendant.getOperatorToken().getKind();
      return (
        operator < SyntaxKind.FirstAssignment ||
        operator > SyntaxKind.LastAssignment
      );
    }
    if (Node.isCallExpression(descendant)) {
      return /^(?:vi|vitest|jest)\.fn$/.test(calleeName(descendant) ?? "");
    }
    return true;
  });
}

/** A file moved from `fromPath` to `toPath`, its relative specifiers naming what they named. */
export function rebaseText(
  text: string,
  fromPath: string,
  toPath: string,
): string {
  const file = new Project({
    useInMemoryFileSystem: true,
    manipulationSettings: { quoteKind: QuoteKind.Double },
    // The moved file may be JavaScript, as in rewriteImports.
    compilerOptions: { allowJs: true },
  }).createSourceFile(`/${toPath}`, text);
  for (const declaration of [
    ...file.getImportDeclarations(),
    ...file.getExportDeclarations(),
  ]) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier === undefined || !specifier.startsWith(".")) continue;
    declaration.setModuleSpecifier(rebased(specifier, fromPath, toPath));
  }
  for (const literal of calledSpecifiers(file)) {
    const specifier = literal.getLiteralValue();
    if (!specifier.startsWith(".")) continue;
    literal.setLiteralValue(rebased(specifier, fromPath, toPath));
  }
  return file.getFullText();
}

/**
 * `specifier`, relative to `fromPath`, made relative to `toPath`. Its query
 * or fragment is no path, so it is kept as written, and so is a trailing
 * slash.
 */
function rebased(specifier: string, fromPath: string, toPath: string): string {
  const suffix = suffixOf(specifier);
  const path = specifier.slice(0, specifier.length - suffix.length);
  const target = posix.normalize(posix.join(posix.dirname(fromPath), path));
  let relative = posix.relative(posix.dirname(toPath), target);
  if (!relative.startsWith(".")) relative = `./${relative}`;
  const slash = path.endsWith("/") && !relative.endsWith("/") ? "/" : "";
  return `${relative}${slash}${suffix}`;
}

/** String methods that read their argument as text. */
const TEXT_METHODS = new Set([
  "startsWith",
  "endsWith",
  "includes",
  "indexOf",
  "lastIndexOf",
  "split",
  "replace",
  "replaceAll",
  "localeCompare",
]);

/**
 * Whether `literal` is only compared as text: an operand of `===` or `!==`,
 * or the argument of a string method such as `startsWith`. Any other call
 * may load it.
 */
function comparedAsText(literal: ModuleLiteral): boolean {
  const parent = literal.getParent();
  if (Node.isBinaryExpression(parent)) {
    return [
      SyntaxKind.EqualsEqualsEqualsToken,
      SyntaxKind.ExclamationEqualsEqualsToken,
      SyntaxKind.EqualsEqualsToken,
      SyntaxKind.ExclamationEqualsToken,
    ].includes(parent.getOperatorToken().getKind());
  }
  if (!Node.isCallExpression(parent)) return false;
  const callee = parent.getExpression();
  return (
    Node.isPropertyAccessExpression(callee) &&
    TEXT_METHODS.has(callee.getName())
  );
}

/** Removes unused explicit type imports; value imports can initialize a module. */
export function withoutUnusedImports(
  project: Project,
  path: string,
  text: string,
) {
  const file = project.createSourceFile(`/__unused__/${path}`, text, {
    overwrite: true,
  });
  const used = new Set(
    file
      .getDescendantsOfKind(SyntaxKind.Identifier)
      .filter(
        (identifier) =>
          identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration) ===
          undefined,
      )
      .map((identifier) => identifier.getText()),
  );
  for (const declaration of file.getImportDeclarations()) {
    for (const named of declaration.getNamedImports()) {
      const local = (named.getAliasNode() ?? named.getNameNode()).getText();
      if (!used.has(local) && declaration.isTypeOnly()) {
        named.remove();
      }
    }
    const namespace = declaration.getNamespaceImport();
    const defaultImport = declaration.getDefaultImport();
    if (
      declaration.getNamedImports().length === 0 &&
      namespace === undefined &&
      defaultImport === undefined &&
      declaration.getImportClause() !== undefined &&
      declaration.isTypeOnly()
    ) {
      declaration.remove();
    }
  }
  // Removing an import can take the blank line after the imports with it.
  const last = file.getImportDeclarations().at(-1);
  const next = last?.getNextSibling();
  if (
    last !== undefined &&
    next !== undefined &&
    !/\n[^\S\n]*\n/.test(
      file.getFullText().slice(last.getEnd(), next.getStart()),
    )
  ) {
    file.insertText(last.getEnd(), "\n");
  }
  const result = file.getFullText();
  project.removeSourceFile(file);
  return result;
}
