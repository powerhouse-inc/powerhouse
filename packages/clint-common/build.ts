import {
  buildBrowserBuildConfig,
  buildNodeBuildConfig,
  CLINT_EXTERNAL,
} from "@powerhousedao/shared/build-config";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { build } from "tsdown";

// The same bundles `ph build` makes. Connect loads this package from a
// registry, so the browser build inlines its dependencies (the editor's UI
// libraries) and leaves only the shared set to Connect's import map.
await build({
  ...buildBrowserBuildConfig(),
  outDir: join("dist", "browser"),
});

// Hosts get no browser code: the node build stubs the document models' hooks.
// This package's editors barrel also exports the chat components, which use
// those hooks, so it is left out here and built in the next step.
const nodeConfig = buildNodeBuildConfig();
await build({
  ...nodeConfig,
  entry: (nodeConfig.entry as string[]).filter(
    (entry) => entry !== "editors/index.ts",
  ),
  outDir: join("dist", "node"),
});

// The editors barrel for Node, built as written: a package's ./editors
// resolves under the node condition, which vitest resolves with, also in
// happy-dom tests that render the chat components. Without the host stubs:
// `editorExports` would keep the hook stub, and the chat editor reads the
// model's generated hook. No host loads this: a host takes `editors` from
// the package root.
console.log("\n▶ Building the editors for Node...");
await build({
  ...nodeConfig,
  entry: { index: "editors/index.ts" },
  outDir: join("dist", "node", "editors"),
  plugins: [],
});

// The chat module (watch trigger, stream bridge, steer processor) is Node only
// and no `ph build` entry. It runs on the host's clint, and reads the chat-session
// model through this package's own export, so neither is inlined.
console.log("\n▶ Building the chat module...");
await build({
  entry: { index: "chat/index.ts" },
  outDir: join("dist", "node", "chat"),
  platform: "node",
  deps: {
    neverBundle: [CLINT_EXTERNAL, /^@powerhousedao\/clint-common(\/.*)?$/],
  },
  config: false,
  clean: false,
  dts: false,
  sourcemap: true,
});

// `--build` so referenced projects emit first; otherwise every cross-package
// import reports TS6305 and the cascade hides real type errors.
console.log("\n▶ Emitting types via tsc...");
execSync("tsc --build", { stdio: "inherit" });

// The stylesheet is compiled whole, as the package has always shipped it: the
// chat editor's utilities, its shadcn tokens and its chat-scoped rules.
console.log("\n▶ Building style.css...");
execSync("tailwindcss -i ./style.css -o ./dist/style.css", {
  stdio: "inherit",
});
