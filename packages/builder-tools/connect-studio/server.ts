import basicSsl from "@vitejs/plugin-basic-ssl";
import { exec } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { createLogger, createServer, InlineConfig, Plugin } from "vite";
import { viteEnvs } from "vite-envs";
import { backupIndexHtml, removeBase64EnvValues } from "./helpers.js";
import { StartServerOptions } from "./types.js";
import { getStudioConfig } from "./vite-plugins/base.js";
import { viteLoadExternalPackages } from "./vite-plugins/external-packages.js";
import { generateImportMapPlugin } from "./vite-plugins/importmap.js";
import { viteConnectDevStudioPlugin } from "./vite-plugins/studio.js";

function resolvePackage(packageName: string, root = process.cwd()) {
  // find connect installation
  const require = createRequire(root);
  return require.resolve(packageName, { paths: [root] });
}

function resolveConnect(root = process.cwd()) {
  const connectHTMLPath = resolvePackage("@powerhousedao/connect", root);
  return resolve(connectHTMLPath, "..");
}
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

function ensureNodeVersion(minVersion = "20") {
  const version = process.versions.node;
  if (!version) {
    return;
  }

  if (version < minVersion) {
    console.error(
      `Node version ${minVersion} or higher is required. Current version: ${version}`,
    );
    process.exit(1);
  }
}

function runShellScriptPlugin(scriptName: string, connectPath: string): Plugin {
  return {
    name: "vite-plugin-run-shell-script",
    buildStart() {
      const scriptPath = join(connectPath, scriptName);
      if (fs.existsSync(scriptPath)) {
        exec(`sh ${scriptPath}`, (error, stdout, stderr) => {
          if (error) {
            console.error(`Error executing the script: ${error.message}`);
            removeBase64EnvValues(connectPath);
            return;
          }
          if (stderr) {
            console.error(stderr);
          }
        });
      }
    },
  };
}

export async function startServer(
  options: StartServerOptions = {
    logLevel: "debug",
  },
) {
  // set from options, as they are dynamically loaded
  process.env.LOG_LEVEL = options.logLevel;

  // exits if node version is not compatible
  ensureNodeVersion();

  const connectPath = options.connectPath ?? resolveConnect();
  const projectRoot = process.cwd();

  // backups index html if running on windows
  backupIndexHtml(connectPath, true);

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
  const HOST = process.env.HOST ? process.env.HOST : "0.0.0.0";

  const OPEN_BROWSER =
    typeof process.env.OPEN_BROWSER === "string"
      ? process.env.OPEN_BROWSER === "true"
      : false;
  const studioConfig = getStudioConfig();

  // needed for viteEnvs
  if (!fs.existsSync(join(connectPath, "src"))) {
    fs.mkdirSync(join(connectPath, "src"));
  }

  process.env.PH_CONNECT_STUDIO_MODE = "true";
  process.env.PH_CONNECT_CLI_VERSION = options.phCliVersion;
  const computedEnv = { ...studioConfig, LOG_LEVEL: options.logLevel };

  const config: InlineConfig = {
    customLogger: logger,
    configFile: false,
    root: connectPath,
    server: {
      port: PORT,
      open: options.open ?? OPEN_BROWSER,
      host: HOST,
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
          find: "@powerhousedao/reactor-browser",
          replacement: join(
            projectRoot,
            "node_modules",
            "@powerhousedao",
            "reactor-browser",
            "dist/src",
          ),
        },
      ],
      // Resolve to the node_modules in the project root
      // "@powerhousedao/design-system/scalars": join(
      //   projectRoot,
      //   "node_modules",
      //   "@powerhousedao",
      //   "design-system",
      //   "dist",
      //   "scalars",
      // ),
      // "@powerhousedao/design-system": join(
      //   projectRoot,
      //   "node_modules",
      //   "@powerhousedao",
      //   "design-system",
      // ),
      // "@powerhousedao/scalars": join(
      //   projectRoot,
      //   "node_modules",
      //   "@powerhousedao",
      //   "scalars",
      // ),
      // "@powerhousedao/reactor-browser/hooks/useUiNodesContext": join(
      //   projectRoot,
      //   "node_modules",
      //   "@powerhousedao",
      //   "reactor-browser",
      //   "dist/src/hooks",
      // ),
      // react: join(projectRoot, "node_modules", "react"),
      // "react-dom": join(projectRoot, "node_modules", "react-dom"),
      // },
    },
    plugins: [
      viteConnectDevStudioPlugin(true, connectPath),
      viteLoadExternalPackages(options.packages, true),
      viteEnvs({
        declarationFile: join(connectPath, ".env"),
        computedEnv,
      }),
      runShellScriptPlugin("vite-envs.sh", connectPath),
      options.https &&
        basicSsl({
          name: "Powerhouse Connect Studio",
        }),
      generateImportMapPlugin(connectPath, [
        { name: "react", provider: "esm.sh" },
        { name: "react-dom", provider: "esm.sh" },
        "@powerhousedao/reactor-browser",
      ]),
    ],
    build: {
      rollupOptions: {
        input: "index.html",
      },
    },
  };

  const server = await createServer(config);

  await server.listen();

  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}
