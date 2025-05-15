import { nodeResolve } from "@rollup/plugin-node-resolve";
import tailwindcss from "@tailwindcss/vite";
import basicSsl from "@vitejs/plugin-basic-ssl";
import viteReact from "@vitejs/plugin-react";
import { exec } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path, { join, resolve } from "node:path";
import {
  build,
  createLogger,
  createServer,
  loadEnv,
  type HtmlTagDescriptor,
  type InlineConfig,
  type Plugin,
} from "vite";
import { viteEnvs } from "vite-envs";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import {
  backupIndexHtml,
  copyConnect,
  removeBase64EnvValues,
} from "./helpers.js";
import { type StartServerOptions } from "./types.js";
import { viteLoadExternalPackages } from "./vite-plugins/external-packages.js";
import { generateImportMapPlugin } from "./vite-plugins/importmap.js";
import { viteConnectDevStudioPlugin } from "./vite-plugins/studio.js";
const clientConfig = {
  meta: [
    {
      tag: "meta",
      attrs: {
        property: "og:title",
        content: "Connect",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:type",
        content: "website",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:url",
        content: "https://apps.powerhouse.io/powerhouse/connect/",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:description",
        content:
          "Navigate your organisation’s toughest operational challenges and steer your contributors to success with Connect. A navigation, collaboration and reporting tool for decentralised and open organisation.",
      },
    },
    {
      tag: "meta",
      attrs: {
        property: "og:image",
        content:
          "https://cf-ipfs.com/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:card",
        content: "summary_large_image",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:image",
        content:
          "https://cf-ipfs.com/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:title",
        content: "Connect",
      },
    },
    {
      tag: "meta",
      attrs: {
        name: "twitter:description",
        content:
          "Navigate your organisation’s toughest operational challenges and steer your contributors to success with Connect. A navigation, collaboration and reporting tool for decentralised and open organisation.",
      },
    },
  ],
};
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

const staticFiles = ["./src/service-worker.ts", "./src/external-packages.js"];

const externalAndExclude = ["vite", "vite-envs", "node:crypto"];
export const externalIds = [/^react(-dom)?(\/.*)?$/, /^node:.*$/];
export async function runBuild(
  options: StartServerOptions = {
    logLevel: "debug",
  },
) {
  console.log("Running build with options", { options });
  // set from options, as they are dynamically loaded
  process.env.LOG_LEVEL = options.logLevel;

  // exits if node version is not compatible
  ensureNodeVersion();
  console.log("Ensured node version");
  const projectRoot = process.cwd();
  console.log("Resolved project root", { projectRoot });
  const connectBuildRoot = join(projectRoot, ".ph", "connect-build");
  console.log("Resolved build src dir path", {
    connectBuildDirPath: connectBuildRoot,
  });
  const connectBuildDistDirPath = join(connectBuildRoot, "dist");
  console.log("Resolved build dist dir path", { connectBuildDistDirPath });
  const connectPath = "/Users/ry/work/powerhouse/apps/connect";
  copyConnect(connectPath, connectBuildRoot);
  console.log("Copied connect");
  const env = loadEnv("production", connectBuildRoot);
  console.log("Loaded env", { env });
  const phPackages = options.packages ?? [];
  console.log("Resolved ph packages", { phPackages });
  const APP_VERSION =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    (process.env.APP_VERSION ?? env.APP_VERSION ?? "1.0.0").toString();
  console.log("Resolved app version", { APP_VERSION });
  console.log("Resolved connect path", { connectPath });

  // backups index html if running on windows
  backupIndexHtml(connectBuildRoot, true);
  console.log("Backed up index html");

  process.env.PH_CONNECT_CLI_VERSION = options.phCliVersion;
  console.log("Set ph cli version", {
    PH_CONNECT_CLI_VERSION: process.env.PH_CONNECT_CLI_VERSION,
  });

  const staticInputs = staticFiles.reduce(
    (acc, file) =>
      Object.assign(acc, {
        [path.basename(file, path.extname(file))]: path.resolve(
          connectBuildRoot,
          file,
        ),
      }),
    {},
  );
  const config: InlineConfig = {
    root: connectBuildRoot,
    build: {
      outDir: connectBuildDistDirPath,
      rollupOptions: {
        input: {
          main: path.resolve(connectBuildRoot, "index.html"),
          ...staticInputs,
        },
        output: {
          entryFileNames: (chunk) =>
            Object.keys(staticInputs).includes(chunk.name)
              ? `${chunk.name}.js`
              : "assets/[name].[hash].js",
        },
        external: [...externalAndExclude, ...externalIds],
      },
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
      nodeResolve(),
      tsconfigPaths(),
      tailwindcss(),
      nodePolyfills({
        include: ["events"],
        globals: {
          Buffer: false,
          global: false,
          process: false,
        },
      }),
      viteReact({
        include: [
          join(connectBuildRoot, "**/*.tsx"),
          join(projectRoot, "**/*.tsx"),
        ],
        babel: {
          parserOpts: {
            plugins: ["decorators"],
          },
        },
      }),
      svgr(),
      createHtmlPlugin({
        minify: true,
        inject: {
          tags: [
            ...(clientConfig.meta.map((meta) => ({
              ...meta,
              injectTo: "head",
            })) as HtmlTagDescriptor[]),
          ],
        },
      }),
      viteLoadExternalPackages(true, phPackages, connectBuildRoot),
      generateImportMapPlugin(connectBuildRoot, [
        { name: "react", provider: "esm.sh" },
        { name: "react-dom", provider: "esm.sh" },
      ]),
    ],
    optimizeDeps: {
      include: ["did-key-creator"],
      exclude: externalAndExclude,
    },
  };

  const output = await build(config);
  console.log("Build output", { output });
}
