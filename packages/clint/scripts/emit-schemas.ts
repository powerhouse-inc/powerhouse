import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitHostJsonSchema } from "@powerhousedao/host-core";
import { declaredHostSchema as clintHostSchema } from "../src/runners/clint-runner.js";
import { declaredHostSchema as mastraHostSchema } from "../src/runners/mastra-runner.js";

/**
 * Writes the editor JSON schemas for hosts run by the clint runners into
 * packages/clint/schemas/, in their DECLARED form (token-able fields accept
 * output/`$env` tokens). Run via `pnpm --filter @powerhousedao/clint
 * emit-schemas` after changing a runner's hostSchema; the drift test in
 * test/runner-contracts.test.ts fails if the committed files fall behind.
 */
const emitted = {
  "host-mastra-runner.schema.json": emitHostJsonSchema(
    "host-mastra-runner",
    mastraHostSchema,
  ),
  "host-clint-runner.schema.json": emitHostJsonSchema(
    "host-clint-runner",
    clintHostSchema,
  ),
};

const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);
fs.mkdirSync(outDir, { recursive: true });
for (const [file, schema] of Object.entries(emitted)) {
  fs.writeFileSync(
    path.join(outDir, file),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  console.log(`emitted schemas/${file}`);
}
