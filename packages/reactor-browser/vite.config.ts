import react from "@vitejs/plugin-react";
import path, { resolve } from "path";
import { defineConfig, UserConfig } from "vite";
import dts from "vite-plugin-dts";
import pkg from "./package.json";

const dependencies = Object.keys(pkg.dependencies).concat(
  Object.keys(pkg.peerDependencies),
);
const dependenciesRegex = dependencies.map(
  (dep) => new RegExp(`^${dep}(?:/.+)?$`),
);
const devDependencies = Object.keys(pkg.devDependencies);
const devDependenciessRegex = devDependencies.map(
  (dep) => new RegExp(`^${dep}(?:/.+)?$`),
);

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      dts({
        include: ["src/**"],
        exclude: ["src/**/*.stories.*"],
        rollupTypes: true,
        insertTypesEntry: true,
        strictOutput: true,
      }),
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
    build: {
      sourcemap: true,
      rollupOptions: {
        output: {
          chunkFileNames: "[name].[hash].js",
          assetFileNames: (info) =>
            // eslint-disable-next-line @typescript-eslint/no-deprecated
            info.name === "style.css" || info.names.includes("style.css")
              ? "style.css"
              : "[name].[hash][extname]",
          preserveModules: true,
        },
        external: (id) => {
          // include imports using the src alias
          if (id.startsWith("@/")) {
            return false;
          }
          // exclude all node modules
          if (id.includes("node_modules")) {
            return true;
          }

          // exclude declared dependencies
          if (
            dependencies.includes(id) ||
            dependenciesRegex.some((depMatcher) => depMatcher.test(id))
          ) {
            return true;
          }

          // throw error if dev dependency is included in the bundle
          if (
            devDependencies.includes(id) ||
            devDependenciessRegex.some((depMatcher) => depMatcher.test(id))
          ) {
            console.error(
              `\x1b[31m\n\nDev dependency is being added to the bundle: ${id}\nMove it to dependencies or peerDependecies\n\n`,
            );
            process.exit(1);
          }
        },
      },
      lib: {
        entry: [resolve("src", "index.ts")],
        formats: ["es"],
        fileName(_format, entryName) {
          return `${entryName}.js`;
        },
        cssFileName: "style",
      },
    },
  } as UserConfig;
});
