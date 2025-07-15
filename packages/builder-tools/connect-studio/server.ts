import {
  backupIndexHtml,
  copyConnect,
  ensureNodeVersion,
  resolveConnect,
  runShellScriptPlugin,
  viteConnectDevStudioPlugin,
  viteLoadExternalPackages,
} from "#connect-utils";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import fs from "node:fs";
import { dirname, join, parse, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLogger,
  createServer,
  searchForWorkspaceRoot,
  type InlineConfig,
} from "vite";
import { viteEnvs } from "vite-envs";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import { type StartServerOptions } from "./types.js";

// silences dynamic import warnings
const logger = createLogger();
// eslint-disable-next-line @typescript-eslint/unbound-method
const loggerWarn = logger.warn;
/**
 * @param {string} msg
 * @param {import('vite').LogOptions} options
 */
logger.warn = (msg, options) => {
  if (msg.includes("The above dynamic import cannot be analyzed by Vite.")) {
    return;
  }
  loggerWarn(msg, options);
};

/**
 * Finds the vite-plugin-node-polyfills folder by traversing up the directory tree
 * @param {string} startPath - The starting path to begin the search
 * @returns {string|null} - The path to the vite-plugin-node-polyfills folder, or null if not found
 */
function findVitePluginNodePolyfills(startPath: string) {
  let currentPath = dirname(startPath);
  const root = parse(currentPath).root;

  while (currentPath !== root) {
    const nodeModulesPath = join(currentPath, "node_modules");
    const vitePluginPath = join(nodeModulesPath, "vite-plugin-node-polyfills");

    if (fs.existsSync(vitePluginPath)) {
      return vitePluginPath;
    }

    const parentPath = dirname(currentPath);
    if (parentPath === currentPath) {
      // Reached the root directory
      break;
    }
    currentPath = parentPath;
  }

  return null;
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

  const connectPath = options.connectPath ?? resolveConnect();
  const projectRoot = process.cwd();
  const studioPath = join(projectRoot, ".ph", "connect-studio");

  copyConnect(connectPath, studioPath);

  // backups index html if running on windows
  backupIndexHtml(studioPath, true);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const HOST = process.env.HOST ? process.env.HOST : "0.0.0.0";

  const OPEN_BROWSER =
    typeof process.env.OPEN_BROWSER === "string"
      ? process.env.OPEN_BROWSER === "true"
      : false;

  // needed for viteEnvs
  if (!fs.existsSync(join(studioPath, "src"))) {
    fs.mkdirSync(join(studioPath, "src"));
  }

  process.env.PH_CONNECT_STUDIO_MODE = "true";
  process.env.PH_CONNECT_CLI_VERSION = options.phCliVersion;
  const computedEnv = { LOG_LEVEL: options.logLevel };

  const currentFilePath = fileURLToPath(import.meta.url);
  const vitePluginNodePolyfillsPath =
    findVitePluginNodePolyfills(currentFilePath);

  const config: InlineConfig = {
    customLogger: logger,
    configFile: false,
    root: studioPath,
    server: {
      port: PORT,
      open: options.open ?? OPEN_BROWSER,
      host: HOST,
      // Allow serving files from current project and linked packages
      fs: {
        allow: generateAllowedPaths(projectRoot),
      },
    },
    optimizeDeps: {
      exclude: ["@electric-sql/pglite"],
    },
    worker: {
      format: "es",
    },
    resolve: {
      alias: [
        { find: "jszip", replacement: "jszip/dist/jszip.min.js" },
        {
          find: "react",
          replacement: join(projectRoot, "node_modules", "react"),
        },
        {
          find: "react-dom",
          replacement: join(projectRoot, "node_modules", "react-dom"),
        },
        {
          find: "vite-plugin-node-polyfills/shims/process",
          replacement: vitePluginNodePolyfillsPath
            ? join(vitePluginNodePolyfillsPath, "shims/process/dist/index.js")
            : join(
                fileURLToPath(import.meta.url),
                "../../../node_modules",
                "vite-plugin-node-polyfills/shims/process/dist/index.js",
              ),
        },
      ],
      dedupe: ["@powerhousedao/reactor-browser"],
    },
    plugins: [
      tailwindcss(),
      nodePolyfills({
        include: ["events"],
        globals: {
          Buffer: false,
          global: false,
          process: true,
        },
      }),
      viteReact({
        // includes js|jsx|ts|tsx)$/ inside projectRoot
        include: [join(projectRoot, "**/*.(js|jsx|ts|tsx)")],
        exclude: ["node_modules", join(studioPath, "assets/*.js")],
      }),
      viteConnectDevStudioPlugin(true, studioPath),
      viteLoadExternalPackages(true, options.packages, studioPath),
      viteEnvs({
        declarationFile: join(studioPath, ".env"),
        computedEnv,
      }),
      runShellScriptPlugin("vite-envs.sh", studioPath),
      options.https &&
        basicSsl({
          name: "Powerhouse Connect Studio",
        }),
    ],
  };

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

  // Log only the final allowed paths
  console.log("📁 Vite allowed paths:", uniquePaths);

  return uniquePaths;
}
