import tailwindPostcssPlugin from "@tailwindcss/postcss";
import { build } from "esbuild";
import { nodeModulesPolyfillPlugin } from "esbuild-plugins-node-modules-polyfill";
import { existsSync } from "fs";
import { cp, mkdir, readFile, writeFile } from "fs/promises";
import postcss from "postcss";

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
    metafile: true,
    format: "esm",
    logLevel: "error",
    external: ["react", "react-dom"],
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
    const inputCss = await readFile(inputPath, "utf8");
    const result = await postcss([tailwindPostcssPlugin]).process(inputCss, {
      from: inputPath,
      to: outputPath,
    });
    await writeFile(outputPath, result.css, "utf8");
    return result;
  } catch (error) {
    console.error("Error building and bundling CSS", { error });
  }
}
