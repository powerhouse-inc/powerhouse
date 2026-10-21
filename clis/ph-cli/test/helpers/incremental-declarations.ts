import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { packageWith, writeTsconfig, type Flow } from "./declarations.js";

export function incrementalDeclarations(flow: Flow) {
  const root = packageWith(flow);
  writeTsconfig(root, {
    declaration: true,
    declarationMap: true,
    declarationDir: "dist/types",
    incremental: true,
    tsBuildInfoFile: "tsconfig.tsbuildinfo",
  });
  const manifest = join(root, "package.json");
  writeFileSync(
    manifest,
    readFileSync(manifest, "utf8").replace(
      "./types/index.d.ts",
      "./dist/types/index.d.ts",
    ),
  );
  return root;
}
