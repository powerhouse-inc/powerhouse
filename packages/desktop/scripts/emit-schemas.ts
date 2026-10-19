import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emitHostJsonSchema } from "@powerhousedao/host-core";
import { hostSchema } from "../src/runner.js";

/**
 * Writes the editor JSON schema for desktop hosts into
 * packages/desktop/schemas/. Run via `pnpm --filter @powerhousedao/desktop
 * emit-schemas` after changing the runner's hostSchema; the drift test in
 * test/runner-contracts.test.ts fails if the committed file falls behind.
 */
const emitted = {
  "host-desktop-runner.schema.json": emitHostJsonSchema(
    "host-desktop-runner",
    hostSchema,
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
