import {
  LOCAL_PACKAGE_ID,
  backupIndexHtml,
  copyConnect,
  ensureNodeVersion,
  makeImportScriptFromPackages,
  readJsonFile,
  resolveConnect,
} from "#connect-utils";
import {
  cpSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "fs";
import path, { dirname, isAbsolute, join } from "path";
import { type InlineConfig, build } from "vite";
import { type ConnectBuildOptions, type RunBuildOptions } from "./types.js";
import { copyFile, mkdir, readdir } from "fs/promises";

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
          "https://cf-ipcom/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
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
          "https://cf-ipcom/ipfs/bafkreigrmclndf2jpbolaq22535q2sw5t44uad3az3dpvkzrnt4lpjt63e",
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
const exclude = new Set<string>([]);

async function copyDir(src: string, dest: string) {
  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    const relative = path.relative(src, srcPath);

    if (exclude.has(relative)) continue;

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await copyFile(srcPath, destPath);
    }
  }
}

export async function runBuild(options: RunBuildOptions) {
  console.log("Running build with options", { options });
  // set ph cli version
  process.env.PH_CONNECT_CLI_VERSION = options.phCliVersion;

  // exits if node version is not compatible
  ensureNodeVersion();
  console.log("Ensured node version");

  // resolve project root
  // the connect build root lives inside the project root
  const projectRoot = process.cwd();
  console.log("Resolved project root", { projectRoot });
  const projectDistDirPath = join(projectRoot, "dist");
  console.log("Resolved project dist dir path", { projectDistDirPath });
  // resolve connect build root
  // the connect build root lives inside the project root
  const connectBuildRoot = join(projectRoot, ".ph", "connect-build");
  console.log("Resolved build src dir path", {
    connectBuildRoot,
  });
  const connectBuildDistDirPath = join(connectBuildRoot, "dist");
  console.log("Resolved build dist dir path", { connectBuildDistDirPath });

  // backups index html if running on windows
  backupIndexHtml(connectBuildRoot, true);
  console.log("Backed up index html");

  rmSync(connectBuildRoot, { recursive: true, force: true });
  mkdirSync(connectBuildRoot, { recursive: true });

  // copy connect to connect build root
  // find local connect dir
  const connectPath = options.connectPath ?? resolveConnect();
  console.log("Resolved connect path", {
    connectPath,
    isFromOptions: !!options.connectPath,
  });
  copyConnect(connectPath, connectBuildDistDirPath);
  console.log("Copied connect");

  // resolve ph packages
  const phPackages = options.packages ?? [];
  console.log("Resolved ph packages", { phPackages });

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
  writeFileSync(join(connectBuildRoot, "external-packages.js"), importScript);
  function getAllExternalAssets(dir: string, excludeFiles: string[] = []) {
    const externalAssets: string[] = [];

    function collectFiles(currentDir: string) {
      const files = readdirSync(currentDir);
      for (const file of files) {
        const filePath = path.join(currentDir, file);
        const relativePath = path.relative(connectBuildRoot, filePath);
        const isExcluded = excludeFiles.includes(relativePath);

        if (statSync(filePath).isDirectory()) {
          collectFiles(filePath);
        } else if (!isExcluded && filePath.endsWith(".js")) {
          externalAssets.push("/" + relativePath.replace(/\\/g, "/"));
        }
      }
    }

    collectFiles(dir);
    return externalAssets;
  }

  const externalAssets = getAllExternalAssets(connectBuildRoot, [
    "external-packages.js",
  ]);
  console.log("Resolved external assets", { externalAssets });
  const config: InlineConfig = {
    publicDir: false,
    root: connectBuildRoot,
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(connectBuildRoot, "index.html"),
        },
        output: {
          entryFileNames: (chunkInfo) => {
            return chunkInfo.name === "external-packages"
              ? "[name].js"
              : "assets/[name]-[hash].js";
          },
          assetFileNames: "assets/[name]-[hash][extname]",
        },
        external: externalAssets,
      },
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
    //   ],
    //   dedupe: ["@powerhousedao/reactor-browser"],
    // },
    plugins: [
      // nodeResolve(),
      // tsconfigPaths(),
      // tailwindcss(),
      // nodePolyfills({
      //   include: ["events"],
      //   globals: {
      //     Buffer: false,
      //     global: false,
      //     process: false,
      //   },
      // }),
      // viteReact({
      //   include: [join(projectRoot, "**/*.(js|jsx|ts|tsx)")],
      //   exclude: ["node_modules", join(connectBuildRoot, "assets/*.js")],
      // }),
      // generateImportMapPlugin(connectBuildRoot, [
      //   { name: "react", provider: "esm.sh" },
      //   { name: "react-dom", provider: "esm.sh" },
      // ]),
    ],
  };

  // const output = await build(config);
  // console.log("Build output", { output });

  // await copyDir(connectBuildRoot, connectBuildDistDirPath);
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
