import {
  backupIndexHtml,
  copyConnect,
  ensureNodeVersion,
  generateImportMapPlugin,
  resolveConnect,
  runShellScriptPlugin,
  viteConnectDevStudioPlugin,
  viteLoadExternalPackages,
} from "#connect-utils";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import fs from "node:fs";
import { join } from "node:path";
import { createLogger, createServer, type InlineConfig } from "vite";
import { viteEnvs } from "vite-envs";
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

  const config: InlineConfig = {
    customLogger: logger,
    configFile: false,
    root: studioPath,
    server: {
      port: PORT,
      open: options.open ?? OPEN_BROWSER,
      host: HOST,
    },
    build: {
      rollupOptions: {
        external: ["@electric-sql/pglite"],
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
      ],
      dedupe: ["@powerhousedao/reactor-browser"],
    },
    plugins: [
      tailwindcss(),
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
      generateImportMapPlugin(studioPath, [
        { name: "react", provider: "esm.sh" },
        { name: "react-dom", provider: "esm.sh" },
      ]),
    ],
  };

  const server = await createServer(config);

  await server.listen();

  server.printUrls();
  server.bindCLIShortcuts({ print: true });
}
