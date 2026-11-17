import { realpathSync } from "node:fs";
import { basename, join, posix, relative } from "node:path";
import { ts } from "ts-morph";
import { packageModuleTargets } from "./package-module-targets.js";
import { readProjectFiles, toPosix } from "./project-files.js";

const CODE_FILE = /\.[cm]?[jt]sx?$/;

export type ProjectModuleReference = {
  readonly file: string;
  readonly specifier: string;
  /**
   * Some use of the specifier reads the module whole: a namespace import,
   * `export *`, or any use outside an import or export declaration, such as
   * a dynamic import.
   */
  readonly whole: boolean;
  readonly targets: readonly {
    readonly path: string;
    readonly throughPackage: boolean;
  }[];
};

/** Static module targets, including every package condition and redirected subpath. */
export function projectModuleReferences(
  projectDir: string,
): readonly ProjectModuleReference[] {
  const root = realpathSync(projectDir);
  const configPath = ts.findConfigFile(root, (file) => ts.sys.fileExists(file));
  const configured =
    configPath === undefined
      ? undefined
      : ts.getParsedCommandLineOfConfigFile(
          configPath,
          {},
          {
            ...ts.sys,
            onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
              throw new Error(
                ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
              );
            },
          },
        );
  const options: ts.CompilerOptions = {
    ...configured?.options,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    resolvePackageJsonImports: true,
    resolvePackageJsonExports: true,
  };
  const resolutions = new Map<
    string,
    {
      file: string | undefined;
      packages: readonly string[];
    }
  >();
  const contents = new Map<string, string | undefined>();
  const packageTargets = packageModuleTargets(root);
  const references: ProjectModuleReference[] = [];
  for (const [sourcePath, bytes] of readProjectFiles(root, CODE_FILE)) {
    const source = ts.createSourceFile(
      sourcePath,
      bytes.toString("utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    /** Each literal, and whether some use of it reads the module whole. */
    const literals = new Map<string, boolean>();
    const visit = (node: ts.Node) => {
      if (ts.isStringLiteralLike(node)) {
        literals.set(
          node.text,
          (literals.get(node.text) ?? false) || readsWhole(node),
        );
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    for (const [literal, whole] of literals) {
      const targets = new Map<string, boolean>();
      const requests = new Map<string, { from: string; named: string }>();
      const enqueue = (from: string, literal: string) => {
        const unqualified =
          literal.slice(0, 1) + literal.slice(1).split(/[?#]/, 1)[0];
        for (const named of new Set([literal, unqualified])) {
          requests.set(JSON.stringify([from, named]), { from, named });
          try {
            const decoded = decodeURIComponent(named);
            requests.set(JSON.stringify([from, decoded]), {
              from,
              named: decoded,
            });
          } catch {
            // Preserve literals that are not valid URL encodings as written.
          }
        }
      };
      enqueue(sourcePath, literal);
      for (const { from, named } of requests.values()) {
        const isRelative = /^\.{1,2}\//.test(named);
        const protect = (target: string, throughPackage = false) => {
          targets.set(target, throughPackage || targets.get(target) === true);
        };
        const protectPackageTarget = (target: string) => {
          protect(target, true);
          const stem = target.replace(CODE_FILE, "");
          for (const extension of [
            "ts",
            "tsx",
            "mts",
            "cts",
            "js",
            "jsx",
            "mjs",
            "cjs",
          ]) {
            protect(`${stem}.${extension}`, true);
            protect(`${stem}/index.${extension}`, true);
          }
        };
        const mapping = packageTargets.imports(from, named);
        for (const redirect of mapping.redirects) {
          enqueue(redirect.from, redirect.specifier);
        }
        for (const target of mapping.targets) {
          protectPackageTarget(target);
        }
        for (const mode of [
          ts.ModuleKind.ESNext,
          ts.ModuleKind.CommonJS,
        ] as const) {
          const key = JSON.stringify([posix.dirname(from), named, mode]);
          let resolution = resolutions.get(key);
          if (resolution === undefined) {
            const consulted = new Set<string>();
            const resolved = ts.resolveModuleName(
              named,
              join(root, from),
              options,
              {
                ...ts.sys,
                readFile: (file) => {
                  if (!contents.has(file))
                    contents.set(file, ts.sys.readFile(file));
                  const text = contents.get(file);
                  if (text !== undefined && basename(file) === "package.json")
                    consulted.add(file);
                  return text;
                },
              },
              undefined,
              undefined,
              mode,
            ).resolvedModule;
            resolution = {
              file: resolved?.resolvedFileName,
              packages: [...consulted],
            };
            resolutions.set(key, resolution);
          }
          if (resolution.file !== undefined) {
            protect(toPosix(relative(root, resolution.file)));
          }
          for (const file of resolution.packages) {
            for (const target of packageTargets.entries(file, named))
              protectPackageTarget(target);
          }
        }
        // Keep complete paths even when the project's resolver cannot load them.
        const paths = isRelative
          ? [posix.join(posix.dirname(from), named)]
          : [...named.matchAll(/subgraphs\//g)].map((match) =>
              named.slice(match.index),
            );
        for (const path of paths) {
          const target = path.replace(CODE_FILE, "");
          protect(`${target}.ts`);
          protect(`${target}/index.ts`);
        }
      }
      if (targets.size > 0) {
        references.push({
          file: sourcePath,
          specifier: literal,
          whole,
          targets: [...targets].map(([path, throughPackage]) => ({
            path,
            throughPackage,
          })),
        });
      }
    }
  }
  return references;
}

/** Whether `literal` reads its module whole, rather than by named bindings. */
function readsWhole(literal: ts.StringLiteralLike): boolean {
  const parent = literal.parent;
  if (ts.isImportDeclaration(parent)) {
    const bindings = parent.importClause?.namedBindings;
    return bindings !== undefined && ts.isNamespaceImport(bindings);
  }
  if (ts.isExportDeclaration(parent)) {
    return (
      parent.exportClause === undefined ||
      ts.isNamespaceExport(parent.exportClause)
    );
  }
  return true;
}
