import { build } from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { existsSync } from "fs";
import { cp, mkdir, readFile, writeFile } from "fs/promises";
import { dirname, resolve } from "path";

/** Runs esbuild to bundle the external packages */
export async function bundleExternalPackages(
  externalPackagesImportScriptPath: string,
  connectBuildDistDirPath: string,
) {
  const result = await build({
    entryPoints: [externalPackagesImportScriptPath],
    outdir: connectBuildDistDirPath,
    bundle: true,
    treeShaking: true,
    minify: true,
    sourcemap: true,
    metafile: true,
    format: "esm",
    logLevel: "warning",
    external: ["react", "react-dom", "react/*", "react-dom/*"],
    banner: {
      js: `import * as requireReact from 'react';
           import * as requireReactDom from 'react-dom';
           import * as requireReactDomClient from 'react-dom/client';
           import * as requireReactJsxRuntime from 'react/jsx-runtime';

           function require(m) {
             if (m === 'react') return requireReact;
             if (m === 'react-dom') return requireReactDom;
             if (m === 'react-dom/client') return requireReactDomClient;
             if (m === 'react/jsx-runtime') return requireReactJsxRuntime;
             throw new Error(\`Module \${m} not found\`);
           }`,
    },
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    loader: {
      ".png": "dataurl",
      ".mp4": "dataurl",
      ".svg": "dataurl",
      ".jpg": "dataurl",
      ".jpeg": "dataurl",
      ".gif": "dataurl",
      ".webp": "dataurl",
      ".avif": "dataurl",
    },
    plugins: [
      nodeModulesPolyfillPlugin({
        fallback: "empty",
        modules: ["process", "events"],
        globals: {
          Buffer: false,
          process: true,
        },
      }),
    ],
  });
  return result;
}

/** Copies the assets from the project to the connect build dist assets directory */
export async function copyAssets(
  projectAssetsDir: string,
  connectBuildAssetsDir: string,
) {
  try {
    if (!existsSync(projectAssetsDir)) {
      return;
    }
    if (!existsSync(connectBuildAssetsDir)) {
      await mkdir(connectBuildAssetsDir, { recursive: true });
    }
    await cp(projectAssetsDir, connectBuildAssetsDir);
  } catch (error) {
    console.error("Error copying assets", { error });
  }
}

/** Builds and bundles the CSS with tailwind */
export async function buildAndBundleCss(inputPath: string, outputPath: string) {
  try {
    const projectDir = dirname(inputPath);
    const tempCssPath = resolve(projectDir, "dist/style.css");

    // Ensure directories exist
    await mkdir(dirname(outputPath), { recursive: true });
    await mkdir(dirname(tempCssPath), { recursive: true });

    const { spawn } = await import("child_process");

    // Use a proper spawn wrapper instead of promisify(spawn)
    await new Promise((resolve, reject) => {
      const child = spawn(
        "npx",
        ["@tailwindcss/cli", "-i", inputPath, "-o", tempCssPath],
        {
          cwd: projectDir,
          stdio: "inherit",
        },
      );

      child.on("close", (code) => {
        if (code === 0) {
          resolve(code);
        } else {
          reject(new Error(`CSS build failed with exit code ${code}`));
        }
      });

      child.on("error", (error) => {
        reject(error);
      });
    });

    const builtCss = await readFile(tempCssPath, "utf8");
    await writeFile(outputPath, builtCss, "utf8");
    return { css: builtCss };
  } catch (error) {
    console.error("Error building and bundling CSS", { error });
    throw error;
  }
}
