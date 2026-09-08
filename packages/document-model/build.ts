import { build } from "tsdown";

const neutralEntries = ["index.ts", "mock.ts", "subgraph.ts"];
const nodeEntries = ["node.mts", "tooling.ts"];

await build({
  entry: neutralEntries,
  outDir: "dist",
  platform: "neutral",
  clean: true,
  dts: false,
  sourcemap: true,
});

await build({
  entry: nodeEntries,
  outDir: "dist",
  platform: "node",
  clean: false,
  dts: false,
  sourcemap: true,
});

// Declaration code splitting puts public descriptor types in a private,
// content-hashed chunk. Consumers that export an inferred descriptor can then
// hit TS2742 because TypeScript cannot name that private module portably. Emit
// each declaration entry on its own so every public declaration is
// self-contained while the JavaScript build can still share runtime chunks.
for (const entry of neutralEntries) {
  await build({
    entry: [entry],
    outDir: "dist",
    platform: "neutral",
    clean: false,
    dts: { emitDtsOnly: true },
    sourcemap: true,
  });
}

for (const entry of nodeEntries) {
  await build({
    entry: [entry],
    outDir: "dist",
    platform: "node",
    clean: false,
    dts: { emitDtsOnly: true },
    sourcemap: true,
  });
}
