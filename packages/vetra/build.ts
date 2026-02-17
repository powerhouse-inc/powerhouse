import { $ } from "bun";
const outdir = "../registry/dist/packages/@powerhousedao/vetra";

const result = await Bun.build({
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

// copy manifest file as json
const file = Bun.file("powerhouse.manifest.json");
await Bun.write(`${outdir}/powerhouse.manifest.json`, file);

// build style.css
const output =
  await $`pnpm exec tailwindcss -i ./style.css -o ./${outdir}/style.css`;
