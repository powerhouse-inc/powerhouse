import { $ } from "bun";
const outdir = "../registry/dist/packages/@powerhousedao/vetra";

// Build 1: Connect bundle (full package with editors, splitting enabled)
await Bun.build({
  entrypoints: ["index.ts"],
  outdir: outdir,
  splitting: true,
  metafile: true,
  plugins: [
    {
      name: "externalize-deps",
      setup(builder) {
        builder.onResolve(
          { filter: /^(react|react-dom)(?:$|\/.+)/ },
          (args) => {
            return {
              path: args.path,
              namespace: args.namespace,
              external: true,
            };
          },
        );
        builder.onResolve({ filter: /^node:.+/ }, (args) => {
          return { path: args.path, namespace: args.namespace, external: true };
        });
      },
    },
  ],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});

// Build 2: Server bundle for document-models only (no splitting, no React)
// This is used by Switchboard to load document models from the registry
await Bun.build({
  entrypoints: ["document-models/index.ts"],
  outdir: outdir,
  splitting: false,
  naming: "document-models.js",
  plugins: [
    {
      name: "externalize-node",
      setup(builder) {
        builder.onResolve({ filter: /^node:.+/ }, (args) => {
          return { path: args.path, namespace: args.namespace, external: true };
        });
      },
    },
  ],
}).catch((err) => {
  console.error("Failed to build document-models bundle:", err);
  process.exit(1);
});

// copy manifest file as json
const file = Bun.file("powerhouse.manifest.json");
await Bun.write(`${outdir}/powerhouse.manifest.json`, file);

// build style.css
const output =
  await $`pnpm exec tailwindcss -i ./style.css -o ./${outdir}/style.css`;
