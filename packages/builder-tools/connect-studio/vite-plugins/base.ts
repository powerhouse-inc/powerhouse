import fs from "fs/promises";
import MagicString from "magic-string";
import { createRequire } from "node:module";
import { basename, dirname } from "node:path";
import type { Package } from "resolve.exports";
import {
  type Alias,
  type AliasOptions,
  type Plugin,
  type PluginOption,
} from "vite";

// matches @powerhousedao/connect, react, react-dom and all their sub-imports like react-dom/client
export const externalIds = [
  /^react(-dom)?(\/.*)?$/,
  /^@powerhousedao\/reactor-browser(\/.*)?$/,
  /^node:.*$/,
];

// https://github.com/vitejs/vite/issues/6393#issuecomment-1006819717
// vite dev server doesn't support setting dependencies as external
// as when building the app.
export function viteIgnoreStaticImport(
  _importKeys: (string | RegExp | false | undefined)[],
): Plugin {
  const importKeys = _importKeys.filter(
    (key) => typeof key === "string" || key instanceof RegExp,
  );
  return {
    name: "vite-plugin-ignore-static-import",
    enforce: "pre",
    // vite will still append /@id/ to an external import
    // so this will rewrite the 'vite:import-analysis' prefix
    configResolved(resolvedConfig) {
      const values = importKeys.map((key) =>
        typeof key === "string" ? key : key.source,
      );
      const reg = new RegExp(
        `("|')\\/@id\\/(${values.join("|")})(\\/[^"'\\\\]*)?\\1`,
        "g",
      );

      (resolvedConfig.plugins as Plugin[]).push({
        name: "vite-plugin-ignore-static-import-replace-idprefix",
        transform: (code) => {
          const s = new MagicString(code);
          const matches = code.matchAll(reg);
          let modified = false;

          for (const match of matches) {
            s.overwrite(
              match.index,
              match.index + match[0].length,
              match[0].replace("/@id/", ""),
            );
            modified = true;
          }

          if (!modified) return null;

          return {
            code: s.toString(),
            map: s.generateMap({ hires: true }), // Generate an accurate source map
          };
        },
      });
    },
    // prevents the external import from being transformed to 'node_modules/...'
    resolveId: (id) => {
      if (
        importKeys.some((key) =>
          typeof key === "string" ? key === id : key.test(id),
        )
      ) {
        return { id, external: true };
      }
    },
    // returns empty string to prevent "Pre-transform error: Failed to load url"
    load(id) {
      if (
        importKeys.some((key) =>
          typeof key === "string" ? key === id : key.test(id),
        )
      ) {
        return "";
      }
    },
  };
}

export function viteReplaceImports(
  imports: Record<string, string>,
): PluginOption {
  const importKeys = Object.keys(imports);
  return {
    name: "vite-plugin-connect-replace-imports",
    enforce: "pre",
    config(config) {
      // adds the provided paths to be resolved by vite
      const resolve = config.resolve ?? {};
      const alias = resolve.alias;
      let resolvedAlias: AliasOptions | undefined;
      if (Array.isArray(alias)) {
        const arrayAlias = [...(alias as Alias[])];

        arrayAlias.push(
          ...Object.entries(imports).map(([find, replacement]) => ({
            find,
            replacement,
          })),
        );

        resolvedAlias = arrayAlias;
      } else if (typeof alias === "object") {
        resolvedAlias = {
          ...(alias as Record<string, string>),
          ...imports,
        };
      } else if (typeof alias === "undefined") {
        resolvedAlias = { ...imports };
      } else {
        console.error("resolve.alias was not recognized");
      }

      if (resolvedAlias) {
        resolve.alias = resolvedAlias;
        config.resolve = resolve;
      }
    },
    resolveId: (id) => {
      // if the path was not provided then declares the local
      // imports as external so that vite ignores them
      if (importKeys.includes(id)) {
        return {
          id,
          external: true,
        };
      }
    },
  };
}

export async function findPackageJson(packageName: string) {
  let packagePath;
  try {
    // Locate the package entry point
    const require = createRequire(process.cwd());
    packagePath = require.resolve(packageName, { paths: [process.cwd()] });
  } catch (err) {
    throw new Error(`Failed to resolve package: ${packageName}`, {
      cause: err,
    });
  }

  // Walk up the directory tree to find package.json
  let dir = dirname(packagePath);
  while (dir !== "/" && dir !== "." && dir !== "node_modules") {
    if (basename(dir) === "dist") {
      dir = dirname(dir);
    }
    const pkgJsonPath = `${dir}/package.json`;
    try {
      await fs.access(pkgJsonPath);
      const file = await fs.readFile(pkgJsonPath, "utf-8");
      return { packageJson: JSON.parse(file) as Package, path: dir };
    } catch {
      dir = dirname(dir); // Move up one level
    }
  }

  throw new Error(`package.json not found for ${packageName}`);
}
