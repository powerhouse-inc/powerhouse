import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emittedRunnerSchemas } from "../src/runners/emitted-schemas.js";

/**
 * Writes the runners' editor JSON Schemas into clis/ph-cli/schemas/. Run
 * `pnpm --filter @powerhousedao/ph-cli exec tsx scripts/emit-runner-schemas.ts`
 * after changing a runner's hostSchema or outputsSchema; the drift test
 * (test/runner-schemas-drift.test.ts) fails while the files are behind.
 */
const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);
fs.mkdirSync(outDir, { recursive: true });
for (const [file, schema] of Object.entries(emittedRunnerSchemas())) {
  fs.writeFileSync(
    path.join(outDir, file),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  console.log(`emitted schemas/${file}`);
}
