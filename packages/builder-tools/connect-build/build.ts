import {
  LOCAL_PACKAGE_ID,
  backupIndexHtml,
  copyConnect,
  ensureNodeVersion,
  generateImportMapPlugin,
  makeImportScriptFromPackages,
  readJsonFile,
} from "#connect-utils";
import { nodeResolve } from "@rollup/plugin-node-resolve";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { writeFileSync } from "fs";
import path, { dirname, isAbsolute, join } from "path";
import {
  type HtmlTagDescriptor,
  type InlineConfig,
  build,
  loadEnv,
} from "vite";
import { createHtmlPlugin } from "vite-plugin-html";
import { nodePolyfills } from "vite-plugin-node-polyfills";
import svgr from "vite-plugin-svgr";
import tsconfigPaths from "vite-tsconfig-paths";
import { type ConnectBuildOptions, type RunBuildOptions } from "./types.js";

const externalAndExclude = ["vite", "vite-envs", "node:crypto"];
export const externalIds = [/^react(-dom)?(\/.*)?$/, /^node:.*$/];

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
export async function runBuild(options: RunBuildOptions) {
  console.log("Running build with options", { options });
  // exits if node version is not compatible
  ensureNodeVersion();
  console.log("Ensured node version");

  // resolve project root
  // the connect build root lives inside the project root
  const projectRoot = process.cwd();
  console.log("Resolved project root", { projectRoot });
  const projectDistDirPath = join(projectRoot, "dist");
  console.log("Resolved project dist dir path", { projectDistDirPath });
  // load env
  const env = loadEnv("production", projectRoot);
  console.log("Loaded env", { env });

  // resolve connect build root
  // the connect build root lives inside the project root
  const connectBuildRoot = join(projectRoot, ".ph", "connect-build");
  console.log("Resolved build src dir path", {
    connectBuildRoot,
  });
  const connectBuildDistDirPath = join(connectBuildRoot, "dist");
  console.log("Resolved build dist dir path", { connectBuildDistDirPath });

  // copy connect to connect build root
  // find local connect dir
  const connectPath = "/Users/ry/work/powerhouse/apps/connect";
  copyConnect(connectPath, connectBuildRoot);
  console.log("Copied connect");

  // resolve ph packages
  const phPackages = options.packages ?? [];
  console.log("Resolved ph packages", { phPackages });

  const APP_VERSION = (
    process.env.APP_VERSION ??
    env.APP_VERSION ??
    "1.0.0"
  ).toString();
  console.log("Resolved app version", { APP_VERSION });
  console.log("Resolved connect path", { connectPath });

  // backups index html if running on windows
  backupIndexHtml(connectBuildRoot, true);
  console.log("Backed up index html");

  process.env.PH_CONNECT_CLI_VERSION = options.phCliVersion;
  console.log("Set ph cli version", {
    PH_CONNECT_CLI_VERSION: process.env.PH_CONNECT_CLI_VERSION,
  });

  const config: InlineConfig = {
    root: connectBuildRoot,
    build: {
      outDir: connectBuildDistDirPath,
      rollupOptions: {
        input: {
          main: path.resolve(connectBuildRoot, "index.html"),
          "external-packages": path.resolve(
            connectBuildRoot,
            "src/external-packages.js",
          ),
        },
        output: {
          entryFileNames: (chunk) =>
            chunk.name.includes("external-packages")
              ? `external-packages.js`
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
        include: [join(projectRoot, "**/*.(js|jsx|ts|tsx)")],
        exclude: ["node_modules", join(connectBuildRoot, "assets/*.js")],
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
  const importScript = makeImportScriptFromPackages({
    packages: phPackages,
    localPackage: true,
    hasStyles: true,
    hasModule: true,
    localJsPath: join(projectDistDirPath, "index.js"),
    localCssPath: join(projectDistDirPath, "style.css"),
    localPackageId: LOCAL_PACKAGE_ID,
  });
  console.log("Resolved import script", { importScript });
  writeFileSync(
    join(connectBuildRoot, "src/external-packages.js"),
    importScript,
  );
  const output = await build(config);
  console.log("Build output", { output });
}

export function buildConnectStudio(options: ConnectBuildOptions) {
  const serverOptions: RunBuildOptions = {};

  if (options.configFile) {
    const config = readJsonFile(options.configFile);
    if (!config) return;

    const configFileDir = dirname(options.configFile);

    if (config.packages && config.packages.length > 0) {
      serverOptions.packages = config.packages.map((p) => p.packageName);
    }

    if (config.documentModelsDir) {
      process.env.LOCAL_DOCUMENT_MODELS = isAbsolute(config.documentModelsDir)
        ? config.documentModelsDir
        : join(configFileDir, config.documentModelsDir);
    }

    if (config.editorsDir) {
      process.env.LOCAL_DOCUMENT_EDITORS = isAbsolute(config.editorsDir)
        ? config.editorsDir
        : join(configFileDir, config.editorsDir);
    }
  }

  if (options.packages && options.packages.length > 0) {
    serverOptions.packages = options.packages.map((p) => p.packageName);
  }

  if (options.phCliVersion) {
    serverOptions.phCliVersion = options.phCliVersion;
  }

  return runBuild(serverOptions).catch((error) => {
    throw error;
  });
}
