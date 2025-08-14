import { build, type BuildResult } from "esbuild";
import fg from "fast-glob";
import fs from "node:fs/promises";
import { builtinModules } from "node:module";
import path from "node:path";
import { exports, type Package } from "resolve.exports";
import { type PluginOption } from "vite";
import { findPackageJson } from "./base.js";

export type Provider = "node_modules" | "esm.sh";

export type Dependency = {
  name: string;
  version?: string;
  provider: Provider;
  dependencies?: string[];
};

const nodeModules = builtinModules.concat(
  builtinModules.map((m) => `node:${m}`),
);

/**
 * Resolves glob exports like `"./*": "./dist/*.js"` and `"./utils/*": "./dist/utils/*.js"`
 * into actual file mappings.
 *
 * @param {string} exportName - The export pattern (e.g., `"./*"` or `"./utils/*"`).
 * @param {string} exportPath - The actual path pattern (e.g., `"./dist/*.js"`).
 * @param {string} srcPath - The package root directory where the exports are located.
 * @returns {Promise<Record<string, string>>} - A mapping of export names to resolved paths.
 */
async function resolveGlobExport(
  exportName: string,
  exportPath: string,
  srcPath: string,
) {
  const resolvedExports = new Map<string, { export: string; file: string }>();

  const hasGloblExport = exportName.endsWith("/*");
  const globPath = hasGloblExport
    ? exportPath.replace("*", "**/*")
    : exportPath;

  const distPath = exportPath.substring(0, exportPath.lastIndexOf("/*"));
  const resolvedSrcPath = hasGloblExport
    ? path.join(srcPath.replace("*", ""), distPath)
    : srcPath;

  const files = await fg(path.join(srcPath, globPath));

  for (const file of files) {
    const relativeSrcFilePath = path.relative(resolvedSrcPath, file); // Relative to the dist folder
    const exportFilePath = path.relative(srcPath, file); // Relative to package root
    const exportKey = relativeSrcFilePath.replace(path.extname(file), ""); // Remove .js extension
    const mappedExport = exportName.replace("*", exportKey); // Replace glob `*` with actual name
    resolvedExports.set(mappedExport, {
      export: `./${relativeSrcFilePath}`,
      file: exportFilePath,
    }); // Final mapped entry
  }
  return resolvedExports;
}

async function addExportToMap(
  exportName: string,
  exportPath: string,
  srcPath: string,
  map: Map<string, { export: string; file: string }>,
) {
  if (exportName.includes("*")) {
    const exports = await resolveGlobExport(exportName, exportPath, srcPath);
    exports.forEach((value, key) => map.set(key, value));
  } else {
    map.set(exportName, { export: exportPath, file: exportPath });
  }
}

async function getPackageExports(
  name: string,
  packageJson: Package,
  srcPath: string,
) {
  const entries = new Map<string, { export: string; file: string }>();
  const mainExport = exports(packageJson, ".", {
    browser: true,
  });
  if (mainExport) {
    for (const entry of mainExport) {
      await addExportToMap(".", entry, srcPath, entries);
    }
  }

  if (!packageJson.exports) {
    return entries;
  }
  if (typeof packageJson.exports === "string") {
    await addExportToMap(name, packageJson.exports, srcPath, entries);
    return entries;
  }

  for (const [key, entry] of Object.entries(packageJson.exports)) {
    if (typeof entry === "string") {
      await addExportToMap(key, entry, srcPath, entries);
    } else {
      const exportEntry = exports(packageJson, key, {
        browser: true,
      });

      const exportResult = exportEntry?.at(0);
      if (exportResult) {
        await addExportToMap(key, exportResult, srcPath, entries);
      } else {
        console.warn(`No browser exports found for ${name}/${key}`);
      }
    }
  }

  // if the main entry file was resolved to a shorter path then updates it
  const main = entries.get(".");
  const resolvedEntry = main
    ? Array.from(entries.entries()).find(
        ([key, entry]) =>
          key != "." && [entry.file, `./${entry.file}`].includes(main.file),
      )
    : undefined;
  const resolvedExport = resolvedEntry?.at(1) as
    | {
        export: string;
        file: string;
      }
    | undefined;
  if (resolvedExport) {
    entries.set(".", {
      export: resolvedExport.export,
      file: resolvedExport.file,
    });
  }

  return entries;
}

function importFromEsmSh(
  name: string,
  version?: string,
  dependencies?: string[],
) {
  const lib = `${name}${version ? `@${version}` : ""}`;
  const query = dependencies?.length ? `&deps=${dependencies.join(",")}` : "";
  return {
    [name]: `https://esm.sh/${lib}${query}`,
    [`${name}/`]: `https://esm.sh/${lib}${query}/`,
  };
}

type BuildModule = () => Promise<BuildResult>;

async function importFromNodeModules(
  name: string,
  modulesDir: string,
  importMapDeps: Set<string>,
  baseUrl: string,
): Promise<{ importMap: Record<string, string>; buildModule: BuildModule }> {
  const importMap: Record<string, string> = {};

  const { packageJson, path: srcPath } = await findPackageJson(name);
  const entries = await getPackageExports(name, packageJson, srcPath);

  if (!entries.size) {
    throw new Error(`No browser exports found for ${name}`);
  }

  const indexFile = entries.get("")?.export || "index";
  const fileName = path.basename(
    entries.get("")?.export || "index",
    path.extname(indexFile),
  );
  const outputPath = path.join(modulesDir, name);

  // Bundle and tree-shake only dependencies (exclude the actual library code)
  const buildModule = () => {
    console.log(`Bundling dependency: ${name}`);
    return build({
      entryPoints: Array.from(entries.values()).map((value) =>
        path.join(srcPath, value.file),
      ),
      outdir: outputPath,
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "esnext",
      splitting: true,
      external: nodeModules.concat(Array.from(importMapDeps)), // Exclude dependencies already in import map
      sourcemap: false,
      minify: false,
    });
  };

  // Add entry to import map
  importMap[name] = `./modules/${name}/${fileName}.js`;

  entries.forEach((entry, key) => {
    importMap[path.join(name, key)] = path.join(
      baseUrl,
      `./modules/${path.join(name, entry.export)}`,
    );
  });

  return { importMap, buildModule };
}

async function generateImportMap(
  outputDir: string,
  dependencies: (string | Dependency)[],
  baseUrl: string,
): Promise<{
  importMap: Record<string, string>;
  buildModules: undefined | (() => Promise<void>);
}> {
  const modulesDir = path.join(outputDir, "/modules");
  await fs.mkdir(modulesDir, { recursive: true });
  const importMapDeps = new Set(
    dependencies.map((dep) => (typeof dep === "string" ? dep : dep.name)),
  );

  let importMap: Record<string, string> = {};

  const buildModules: BuildModule[] = [];

  for (const dependency of dependencies) {
    const isString = typeof dependency === "string";
    const name = isString ? dependency : dependency.name;
    const version = isString ? undefined : dependency.version;
    const provider = isString ? "node_modules" : dependency.provider;
    const subDependencies = isString ? undefined : dependency.dependencies;

    if (provider === "esm.sh") {
      const imports = importFromEsmSh(name, version, subDependencies);
      importMap = { ...importMap, ...imports };
      // TODO: this does not make sense.
      // We need to give this the actual correct type, or if we really don't know what it is, then make it `unknown`
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-conversion
    } else if (provider.toString() === "node_modules") {
      const { importMap: imports, buildModule } = await importFromNodeModules(
        name,
        modulesDir,
        importMapDeps,
        baseUrl,
      );
      importMap = { ...importMap, ...imports };
      buildModules.push(buildModule);
    } else {
      throw new Error(`Unsupported provider: ${provider as string}`);
    }
  }

  return {
    importMap,
    buildModules: async () => {
      await Promise.all(buildModules.map((build) => build()));
    },
  };
}

function addImportMapToHTML(importMap: Record<string, string>, html: string) {
  let newHtml = "";

  // Regex to find existing import map
  const importMapRegex = /<script type="importmap">(.*?)<\/script>/s;
  const match = importMapRegex.exec(html);

  // If an import map exists, merge the imports
  if (match) {
    try {
      const existingImportMap = JSON.parse(match[1]) as {
        imports: Record<string, string>;
      };
      existingImportMap.imports = {
        ...existingImportMap.imports,
        ...importMap,
      };

      const mergedImportMapString = JSON.stringify(existingImportMap, null, 2);

      newHtml = html.replace(
        importMapRegex,
        `<script type="importmap">${mergedImportMapString}</script>`,
      );
    } catch (error) {
      console.error("⚠️ Error parsing existing import map:", error);
    }
  } else {
    const importMapString = JSON.stringify({ imports: importMap }, null, 2);
    const importMapScript = `<script type="importmap">${importMapString}</script>`;
    newHtml = html.replace("</head>", `${importMapScript}\n</head>`);
  }
  return newHtml;
}

/**
 * Vite plugin to bundle or copy dependencies and inject an import map into `index.html`.
 *
 * @param {string} outputDir - The directory where the modules should be placed.
 * @param {(string | { name: string; provider: string })[]} dependencies -
 *        List of dependencies to process. Can be:
 *        - A string (dependency is copied as is).
 *        - An object `{ name, provide }` where:
 *          - `name` (string): The module name.
 *          - `provider` (string): Where to retrieve the module bundle. Defaults to node_modules.
 *
 * @returns {Plugin} A Vite plugin that processes dependencies and injects an import map.
 */
export function generateImportMapPlugin(
  outputDir: string,
  dependencies: (string | Dependency)[],
): PluginOption[] {
  let buildModules: (() => Promise<void>) | undefined = undefined;
  let importMap: Record<string, string> = {};
  return [
    {
      name: "vite-plugin-importmap",
      enforce: "post",
      // generates import map according to the base url
      // and collects build method for each dependency
      async configResolved(config) {
        const result = await generateImportMap(
          outputDir,
          dependencies,
          config.base,
        );
        importMap = result.importMap;
        buildModules = result.buildModules;
      },
      // builds modules when building the bundle
      closeBundle() {
        return buildModules?.();
      },
      // builds modules when starting the dev server
      configureServer() {
        return buildModules?.();
      },
      // adds importmap to the html
      transformIndexHtml(html) {
        const newHtml = addImportMapToHTML(importMap, html);
        return newHtml || html;
      },
    },
  ];
}
