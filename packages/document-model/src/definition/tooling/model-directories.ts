import type { DefinitionDiagnostic } from "@powerhousedao/shared/document-model";
import { DOCUMENT_MODEL_ENTRY_FILES } from "@powerhousedao/shared/clis/definition-sources";
import {
  pathWithin,
  realPathThroughExistingParent,
} from "@powerhousedao/shared/clis/real-paths";
import {
  lstatSync,
  readdirSync,
  realpathSync,
  statSync,
  type Stats,
} from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { compareCodeUnits } from "../kernel/primitives.js";
import { toolingDiagnostics } from "./diagnostic-codes.js";
import { describeThrown } from "./structured-diagnostics.js";

/** @experimental The models directory a config without `documentModelsDir` uses. */
export const DEFAULT_DOCUMENT_MODELS_DIR = "./document-models";

/**
 * @experimental What one immediate directory of the models directory holds.
 *
 * - `stored`: a schema-first model, because `<name>/<name>.json` exists. An
 *   unreadable or invalid file is still this model's, never a code-first one.
 * - `generated`: schema-first generated code (`gen/` or `v<N>/gen/`) without
 *   its stored specification. Its generated modules stay; nothing is pruned.
 * - `module`: a code-first model, whose entry is the directory's one
 *   `index.<ext>` module. Generated code wins over an index, which codegen
 *   writes into schema-first directories too.
 * - `invalid`: a directory discovery cannot classify; a diagnostic says why.
 * - `none`: no model entry. The declaration scan reports code-first models
 *   declared here without an entry.
 */
export type DocumentModelDirectory = {
  readonly name: string;
  /** Absolute, as spelled under the models directory. */
  readonly path: string;
} & (
  | { readonly kind: "stored"; readonly specification: `./${string}` }
  | { readonly kind: "generated" }
  | { readonly kind: "module"; readonly entry: `./${string}` }
  | { readonly kind: "invalid" }
  | { readonly kind: "none" }
);

/** @experimental The classified model directories, sorted by name. */
export type DocumentModelDirectories = {
  /** Absolute. */
  readonly documentModelsDir: string;
  readonly directories: readonly DocumentModelDirectory[];
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

/** `./`-prefixed POSIX path of `path` inside `packageRoot`. */
export function packageSpecifier(
  packageRoot: string,
  path: string,
): `./${string}` {
  return `./${relative(packageRoot, path).split(sep).join("/")}`;
}

function statOrUndefined(
  path: string,
  stat: typeof statSync | typeof lstatSync = statSync,
): Stats | undefined {
  return stat(path, { throwIfNoEntry: false });
}

function isDirectory(path: string): boolean {
  return statOrUndefined(path)?.isDirectory() === true;
}

function hasGeneratedSchemaFirstLayout(directory: string): boolean {
  if (isDirectory(join(directory, "gen"))) return true;
  return readdirSync(directory).some(
    (name) => /^v\d+$/.test(name) && isDirectory(join(directory, name, "gen")),
  );
}

function entryFiles(directory: string): readonly string[] {
  return DOCUMENT_MODEL_ENTRY_FILES.filter(
    (name) => statOrUndefined(join(directory, name))?.isFile() === true,
  );
}

/**
 * The configured models directory, resolved inside the package, or why it
 * cannot be read. The package root itself is refused: its directories are
 * the package's other sources, not models.
 */
export function resolveDocumentModelsDir(
  packageRoot: string,
  config: Readonly<Record<string, unknown>>,
):
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly diagnostic: DefinitionDiagnostic } {
  const configured = config.documentModelsDir ?? DEFAULT_DOCUMENT_MODELS_DIR;
  const invalid = (message: string, received: string) => ({
    ok: false as const,
    diagnostic: toolingDiagnostics.create({
      code: "PH-CONFIG-SOURCE-INVALID",
      path: ["documentModelsDir"],
      message,
      expected: "a package-relative directory such as ./document-models",
      received,
      repair:
        "Point documentModelsDir at the directory that holds the models, or remove it to use ./document-models.",
    }),
  });
  if (typeof configured !== "string" || configured.trim() === "") {
    return invalid(
      "documentModelsDir is not a directory path.",
      JSON.stringify(configured),
    );
  }
  const path = resolve(packageRoot, configured);
  let inside = pathWithin(packageRoot, path) !== null;
  try {
    inside &&=
      pathWithin(
        realpathSync.native(packageRoot),
        realPathThroughExistingParent(path),
      ) !== null;
  } catch {
    inside = false;
  }
  if (!inside) {
    return {
      ok: false,
      diagnostic: toolingDiagnostics.create({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        path: ["documentModelsDir"],
        message:
          "documentModelsDir leaves the package root, so its models are not this package's.",
        expected: "a directory inside the package",
        received: configured,
        repair: "Point documentModelsDir at a directory inside the package.",
      }),
    };
  }
  if (resolve(path) === resolve(packageRoot)) {
    return invalid(
      "documentModelsDir names the package root, whose directories are not document models.",
      configured,
    );
  }
  let stats: Stats | undefined;
  try {
    stats = statOrUndefined(path);
  } catch {
    stats = undefined;
  }
  if (stats !== undefined && !stats.isDirectory()) {
    return invalid(
      "documentModelsDir names a file, not a directory.",
      configured,
    );
  }
  return { ok: true, path };
}

function classify(
  packageRoot: string,
  packageRootIdentity: string,
  name: string,
  path: string,
  diagnostics: DefinitionDiagnostic[],
): DocumentModelDirectory {
  const at = { name, path };
  const specification = join(path, `${name}.json`);
  const stored = statOrUndefined(specification, lstatSync) !== undefined;
  const generated = !stored && hasGeneratedSchemaFirstLayout(path);
  const entries = stored || generated ? [] : entryFiles(path);
  if (!stored && !generated && entries.length === 0) {
    return { ...at, kind: "none" };
  }
  const real = realpathSync.native(path);
  if (pathWithin(packageRootIdentity, real) === null) {
    diagnostics.push(
      toolingDiagnostics.create({
        code: "PH-CONFIG-SOURCE-OUTSIDE-PACKAGE",
        source: { specifier: packageSpecifier(packageRoot, path) },
        path: [],
        message:
          "This model directory resolves through a symlink that leaves the package root, so its model is not this package's.",
        expected: "a model directory whose real path stays inside the package",
        received: packageSpecifier(packageRoot, path),
        repair:
          "Replace the symlink with a model directory that really lives in this package.",
      }),
    );
    return { ...at, kind: "invalid" };
  }
  if (stored) {
    return {
      ...at,
      kind: "stored",
      specification: packageSpecifier(packageRoot, specification),
    };
  }
  if (generated) {
    diagnostics.push(
      toolingDiagnostics.create({
        code: "PH-PKG-STORED-SPEC-MISSING",
        source: { specifier: packageSpecifier(packageRoot, path) },
        path: [],
        message: `This directory holds generated schema-first code but no ${name}.json, so the model it generated cannot be checked or regenerated.`,
        expected: packageSpecifier(packageRoot, specification),
        received: "generated code only",
        repair: `Restore ${name}.json from version control or export it again from the document model editor.`,
      }),
    );
    return { ...at, kind: "generated" };
  }
  if (entries.length > 1) {
    const found = entries.map((entry) =>
      packageSpecifier(packageRoot, join(path, entry)),
    );
    diagnostics.push(
      toolingDiagnostics.create({
        code: "PH-CONFIG-SOURCE-INVALID",
        source: { specifier: found[0] },
        path: [],
        message:
          "This model directory has several entry modules, so discovery cannot tell which one exports the model.",
        expected: "one index module per model directory",
        received: found.join(", "),
        repair: `Keep one of ${found.join(", ")} and delete or rename the others.`,
      }),
    );
    return { ...at, kind: "invalid" };
  }
  return {
    ...at,
    kind: "module",
    entry: packageSpecifier(packageRoot, join(path, entries[0])),
  };
}

/**
 * @experimental Classifies each immediate directory of the models directory
 * by the files it holds, without importing anything. Discovery never reads
 * the generated barrels beside the directories. A missing models directory
 * holds no models; a directory that cannot be read is `invalid` with a
 * diagnostic, so no caller mistakes it for an absent model.
 */
export function discoverDocumentModelDirectories(
  packageRoot: string,
  documentModelsDir: string,
): DocumentModelDirectories {
  const diagnostics: DefinitionDiagnostic[] = [];
  let names: string[];
  let packageRootIdentity: string;
  try {
    packageRootIdentity = realpathSync.native(packageRoot);
    names = readdirSync(documentModelsDir);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push(unreadable(packageRoot, documentModelsDir, error));
    }
    return { documentModelsDir, directories: [], diagnostics };
  }
  const directories = names
    .filter((name) => name !== "node_modules" && !name.startsWith("."))
    .sort(compareCodeUnits)
    .flatMap((name): DocumentModelDirectory[] => {
      const path = join(documentModelsDir, name);
      try {
        if (!isDirectory(path)) return [];
        return [
          classify(packageRoot, packageRootIdentity, name, path, diagnostics),
        ];
      } catch (error) {
        diagnostics.push(unreadable(packageRoot, path, error));
        return [{ name, path, kind: "invalid" }];
      }
    });
  return { documentModelsDir, directories, diagnostics };
}

function unreadable(
  packageRoot: string,
  path: string,
  error: unknown,
): DefinitionDiagnostic {
  return toolingDiagnostics.create({
    code: "PH-IMPORT-FAILED",
    source: { specifier: packageSpecifier(packageRoot, path) },
    path: [],
    message:
      "This path under the document models directory could not be read, so discovery cannot tell which model it holds.",
    expected: "a readable directory",
    received: describeThrown(error),
    repair:
      "Fix the permissions of the path, or move it out of the document models directory.",
  });
}
