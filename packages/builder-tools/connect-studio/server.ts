import { getConfig } from "@powerhousedao/config/node";
import fs from "node:fs";
import path, { dirname, join, resolve } from "node:path";
import {
  createLogger,
  createServer,
  loadConfigFromFile,
  mergeConfig,
  searchForWorkspaceRoot,
  type InlineConfig,
} from "vite";
import { ensureNodeVersion, resolvePackage } from "../connect-utils/helpers.js";
import type { StartServerOptions } from "./types.js";

// silences dynamic import warnings
const logger = createLogger();
const loggerWarn = logger.warn;
/**
 * @param {string} msg
 * @param {import('vite').LogOptions} options
 */
logger.warn = (msg, options) => {
  // if (msg.includes("The above dynamic import cannot be analyzed by Vite.")) {
  //   return;
  // }
  loggerWarn(msg, options);
};

function getConnectPaths() {
  try {
    const connectIndexPath = resolvePackage(
      "@powerhousedao/connect/index.html",
    );
    const connectViteConfigPath = resolvePackage(
      "@powerhousedao/connect/vite.config.ts",
    );
    return { connectIndexPath, connectViteConfigPath };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Cannot find module")
    ) {
      throw new Error('Please install "@powerhousedao/connect"');
    }
    throw error;
  }
}

export async function startServer(
  options: StartServerOptions = {
    logLevel: "info",
  },
) {
  // set from options, as they are dynamically loaded
  process.env.LOG_LEVEL = options.logLevel;

  // exits if node version is not compatible
  ensureNodeVersion();

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const HOST = process.env.HOST ? process.env.HOST : "0.0.0.0";

  const OPEN_BROWSER =
    typeof process.env.OPEN_BROWSER === "string"
      ? process.env.OPEN_BROWSER === "true"
      : false;

  process.env.PH_CONNECT_STUDIO_MODE = "true";
  process.env.PH_CONNECT_CLI_VERSION = options.phCliVersion;

  const computedEnv = { LOG_LEVEL: options.logLevel };

  const phConfig = getConfig(options.configFile);
  const phPackages = phConfig.packages?.map((p) => p.packageName) ?? [];

  // infers the project path from the config file path if provided,
  // otherwise fallbacks to the current working directory
  const localPackage = options.configFile
    ? path.dirname(path.resolve(options.configFile))
    : process.cwd();
  const hasLocalPackage = fs.existsSync(path.join(localPackage, "index.ts"));
  if (hasLocalPackage) {
    phPackages.push(localPackage);
  }
  process.env.PH_PACKAGES = phPackages.join(",");

  // TODO: should we move the document model editor to common or vetra
  // and make Connect a peerDependency of builder-tools?
  const { connectIndexPath, connectViteConfigPath } = getConnectPaths();

  const connectViteConfig = await loadConfigFromFile(
    { command: "serve", mode: "development" },
    connectViteConfigPath,
  );
  if (!connectViteConfig) {
    throw new Error(
      `Failed to load Connect vite config from ${connectViteConfigPath}`,
    );
  }
  console.log(generateAllowedPaths(localPackage));
  const config = mergeConfig(connectViteConfig.config, {
    root: dirname(connectIndexPath),
    customLogger: logger,
    configFile: false,
    server: {
      port: PORT,
      open: options.open ?? OPEN_BROWSER,
      host: HOST,
      // Allow serving files from current project and linked packages
      fs: {
        strict: true,
        allow: generateAllowedPaths(localPackage),
      },
      watch: {
        ignored: ["**/subgraphs/**", "**/powerhouse.manifest.json"],
      },
    },
    plugins: [
      {
        name: "resolve-external-package-imports",
        enforce: "pre" as const,
        async resolveId(source: string, importer?: string) {
          // Only intercept imports from the external packages
          const isBare =
            !source.startsWith(".") &&
            !source.startsWith("/") &&
            !source.startsWith("\0");
          const fromDep =
            importer &&
            importer.includes("/node_modules/@powerhousedao/connect/");
          if (
            !isBare ||
            (fromDep && !importer.includes("ph:external-packages"))
          )
            return null;

          // Resolve the import from the host project.
          return await this.resolve(
            source,
            path.join(localPackage, "index.ts"),
            {
              skipSelf: true,
            },
          );
        },
      },
    ],
    // resolve: {
    //   dedupe: ["react", "react-dom"],
    // },
    //   optimizeDeps: {
    //     exclude: ["@electric-sql/pglite"],
    //   },
    //   worker: {
    //     format: "es",
    //   },
    //   resolve: {
    //     alias: [
    //       { find: "jszip", replacement: "jszip/dist/jszip.min.js" },
    //       {
    //         find: "react",
    //         replacement: join(projectRoot, "node_modules", "react"),
    //       },
    //       {
    //         find: "react-dom",
    //         replacement: join(projectRoot, "node_modules", "react-dom"),
    //       },
    //       {
    //         find: "vite-plugin-node-polyfills/shims/process",
    //         replacement: vitePluginNodePolyfillsPath
    //           ? join(vitePluginNodePolyfillsPath, "shims/process/dist/index.js")
    //           : join(
    //               fileURLToPath(import.meta.url),
    //               "../../../node_modules",
    //               "vite-plugin-node-polyfills/shims/process/dist/index.js",
    //             ),
    //       },
    //     ],
    //     dedupe: ["@powerhousedao/reactor-browser"],
    //   },
    //   plugins: [
    //     tailwindcss(),
    //     nodePolyfills({
    //       include: ["events"],
    //       globals: {
    //         Buffer: false,
    //         global: false,
    //         process: true,
    //       },
    //     }),
    //     viteReact({
    //       // includes js|jsx|ts|tsx)$/ inside projectRoot
    //       include: [join(projectRoot, "**/*.(js|jsx|ts|tsx)")],
    //       exclude: ["node_modules", join(studioPath, "assets/*.js")],
    //     }),
    //     viteConnectDevStudioPlugin(true, studioPath),
    //     viteLoadExternalPackages(true, options.packages, studioPath),
    //     // Only enable documents HMR when explicitly requested (e.g., from ph-cli vetra)
    //     options.enableDocumentsHMR && viteDocumentModelsHMR(studioPath),
    //     options.enableDocumentsHMR && viteEditorsHMR(studioPath),
    //     viteEnvs({
    //       declarationFile: join(studioPath, ".env"),
    //       computedEnv,
    //     }),
    //     runShellScriptPlugin("vite-envs.sh", studioPath),
    //     options.https &&
    //       basicSsl({
    //         name: "Powerhouse Connect Studio",
    //       }),
    //   ],
  } satisfies InlineConfig);

  const server = await createServer(config);

  await server.listen();

  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}

// Function to generate allowed paths for current project and linked packages
function generateAllowedPaths(projectRoot: string): string[] {
  const allowedPaths: string[] = [
    searchForWorkspaceRoot(projectRoot),
    projectRoot,
    join(projectRoot, "node_modules"),
    join(projectRoot, "node_modules", "**"),
  ];

  // Read package.json to find linked packages
  const packageJsonPath = join(projectRoot, "package.json");

  try {
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf-8"),
      ) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };

      const allDependencies: Record<string, string> = {
        ...(packageJson.dependencies || {}),
        ...(packageJson.devDependencies || {}),
      };

      Object.entries(allDependencies).forEach(([, version]) => {
        if (typeof version === "string" && version.startsWith("link:")) {
          const linkedPath = version.replace("link:", "");
          const absoluteLinkedPath = resolve(projectRoot, linkedPath);

          // Verify the linked path exists
          if (fs.existsSync(absoluteLinkedPath)) {
            // Allow the linked package root and its contents
            allowedPaths.push(absoluteLinkedPath);
            allowedPaths.push(join(absoluteLinkedPath, "**"));

            // Allow the linked package's node_modules
            const linkedNodeModules = join(absoluteLinkedPath, "node_modules");
            allowedPaths.push(linkedNodeModules);
            allowedPaths.push(join(linkedNodeModules, "**"));
          }
        }
      });
    }
  } catch (error) {
    console.warn(
      "Failed to read package.json for linked packages:",
      error instanceof Error ? error.message : String(error),
    );
  }

  // Remove duplicates
  const uniquePaths = [...new Set(allowedPaths)];
  return uniquePaths;
}
