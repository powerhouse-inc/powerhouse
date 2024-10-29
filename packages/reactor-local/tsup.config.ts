import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";
import { defineConfig } from "tsup";

const require = createRequire(import.meta.url);

function getDependencies(packageName: string) {
  try {
    const dependencyPath = require.resolve(packageName);
    const packagePath = join(dependencyPath, "../../package.json");
    const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
    };
    return Object.keys(packageJson.dependencies || {}).concat(
      Object.keys(packageJson.peerDependencies || {}),
    );
  } catch (error) {
    console.error(`Failed to load dependencies for ${packageName}:`, error);
    return [];
  }
}

export default defineConfig({
  entry: ["src/**/*.ts"],
  splitting: true,
  sourcemap: false,
  clean: true,
  format: "esm",
  treeshake: true,
  bundle: true,
  platform: "node",
  target: "node22",
  noExternal: ["document-drive"],
  external: getDependencies("document-drive"),
  shims: true,
  cjsInterop: true,
  dts: {
    entry: {
      server: "src/server.ts",
      cli: "src/cli.ts",
    },
  },
});
