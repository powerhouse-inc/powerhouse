import { exec } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { createLogger, createServer, InlineConfig, Plugin } from "vite";
import { backupIndexHtml, removeBase64EnvValues } from "./helpers.js";
import { StartServerOptions } from "./types.js";
import { getStudioConfig } from "./vite-plugins/base.js";

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

export function buildViteConfig(
  options: StartServerOptions = {
    logLevel: "debug",
  },
  studioMode: boolean,
  env: Record<string, unknown> = {},
) {
  const connectPath = options.connectPath ?? resolveConnect();
  const projectRoot = process.cwd();

  const config: InlineConfig = {
    customLogger: logger,
    configFile: false,
    root: connectPath,
    optimizeDeps: {
      include: [],
    },
    // resolve: {
    //   alias: [
    //     { find: "jszip", replacement: "jszip/dist/jszip.min.js" },
    //     {
    //       find: "react",
    //       replacement: join(projectRoot, "node_modules", "react"),
    //     },
    //     {
    //       find: "react-dom",
    //       replacement: join(projectRoot, "node_modules", "react-dom"),
    //     },
    //     {
    //       find: "@powerhousedao/reactor-browser",
    //       replacement: join(
    //         projectRoot,
    //         "node_modules",
    //         "@powerhousedao",
    //         "reactor-browser",
    //         "dist/src",
    //       ),
    //     },
    //   ],
    // },
    plugins: [
      // viteConnectDevStudioPlugin(studioMode, connectPath),
      // viteLoadExternalPackages(options.packages, studioMode),
      // viteEnvs({
      //   declarationFile: join(connectPath, ".env"),
      //   computedEnv: env,
      // }),
      // runShellScriptPlugin("vite-envs.sh", connectPath),
      // options.https &&
      //   basicSsl({
      //     name: "Powerhouse Connect Studio",
      //   }),
      // generateImportMapPlugin(connectPath, [
      //   { name: "react", provider: "esm.sh" },
      //   { name: "react-dom", provider: "esm.sh" },
      //   "@powerhousedao/reactor-browser",
      // ]),
    ],
    build: {
      outDir: join(projectRoot, ".ph", "connect"),
      rollupOptions: {
        input: join(connectPath, "index.html"),
        external(source, importer, isResolved) {
          console.log("source:", source);
          return importer === join(connectPath, "index.html");
        },
      },
    },
  };

  return config;
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
  const baseConfig = buildViteConfig(options, true, computedEnv);
  const config: InlineConfig = {
    ...baseConfig,
    server: {
      port: PORT,
      open: options.open ?? OPEN_BROWSER,
      host: HOST,
    },
  };

  const server = await createServer(config);

  await server.listen();

  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}
