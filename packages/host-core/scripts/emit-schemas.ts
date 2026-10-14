import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { emittedHostSchemas } from "../src/host-schemas.js";

/**
 * Writes the editor JSON schemas for host.js files (D2.a) into
 * packages/host-core/schemas/. Run via `pnpm --filter @powerhousedao/host-core
 * emit-schemas` after changing host-schemas.ts; the drift test fails if the
 * committed artifacts fall behind.
 */
const outDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);
fs.mkdirSync(outDir, { recursive: true });
for (const [file, schema] of Object.entries(emittedHostSchemas())) {
  fs.writeFileSync(
    path.join(outDir, file),
    `${JSON.stringify(schema, null, 2)}\n`,
  );
  console.log(`emitted schemas/${file}`);
}
