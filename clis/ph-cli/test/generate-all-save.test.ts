import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterEach, expect, it } from "vitest";
import { cleanUp, packageWith, writeTsconfig } from "./helpers/declarations.js";

afterEach(cleanUp);
it("saves other generators' output when the built generate all refuses a subgraph", () => {
  const root = packageWith("schema-first");
  writeTsconfig(root, { module: "nodenext", skipLibCheck: true }, ["**/*.ts"]);
  for (const dir of [
    "ai",
    "subgraphs/broken",
    "document-models",
    "editors",
    "processors",
    "apps",
    "pieces",
  ])
    mkdirSync(join(root, dir), { recursive: true });
  writeFileSync(join(root, "ai/tools.ts"), "export const aiTools = {};\n");
  writeFileSync(
    join(root, "subgraphs/broken/index.ts"),
    'throw new Error("refused subgraph probe");\n',
  );
  const result = spawnSync(
    process.execPath,
    [resolve(import.meta.dirname, "../dist/cli.mjs"), "generate", "all"],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 60_000,
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(1);
  expect(result.stdout + result.stderr).toContain("refused subgraph probe");
  expect(readFileSync(join(root, "index.ts"), "utf8")).toContain(
    'export { aiTools } from "./ai/tools.js";',
  );
}, 90_000);
