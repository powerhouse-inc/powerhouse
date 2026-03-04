import { $ } from "bun";
const cdnOutdir = "./cdn";

interface ResolveArgs {
  path: string;
  namespace: string;
}

interface PluginBuilder {
  onResolve(
    options: { filter: RegExp },
    callback: (args: ResolveArgs) => {
      path: string;
      namespace: string;
      external: boolean;
    },
  ): void;
}

const externalizeDepsPlugin = {
  name: "externalize-deps",
  setup(builder: PluginBuilder) {
    builder.onResolve({ filter: /^(react|react-dom)(?:$|\/.+)/ }, (args) => ({
      path: args.path,
      namespace: args.namespace,
      external: true,
    }));
    builder.onResolve({ filter: /^node:.+/ }, (args) => ({
      path: args.path,
      namespace: args.namespace,
      external: true,
    }));
  },
};

const externalizeNodePlugin = {
  name: "externalize-node",
  setup(builder: PluginBuilder) {
    builder.onResolve({ filter: /^node:.+/ }, (args) => ({
      path: args.path,
      namespace: args.namespace,
      external: true,
    }));
  },
};

// Build 1: Connect bundle (full package with editors, splitting enabled)
await Bun.build({
  entrypoints: ["index.ts"],
  outdir: cdnOutdir,
  splitting: true,
  metafile: true,
  plugins: [externalizeDepsPlugin],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

// Build 2: Server bundle for document-models only (no splitting, no React)
// This is used by Switchboard to load document models from the registry
await Bun.build({
  entrypoints: ["document-models/index.ts"],
  outdir: cdnOutdir,
  splitting: false,
  naming: "document-models.js",
  plugins: [externalizeNodePlugin],
}).catch((err) => {
  console.error("Failed to build document-models bundle:", err);
  process.exit(1);
});

// copy manifest file
const file = Bun.file("powerhouse.manifest.json");
await Bun.write(`${cdnOutdir}/powerhouse.manifest.json`, file);

// build style.css
await $`pnpm exec tailwindcss -i ./style.css -o ./${cdnOutdir}/style.css`;
