import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emittedHostSchemas } from "../src/host-schemas.js";

const schemasDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);

/** Committed artifacts must match the live schemas — same pattern as the
 * runtime-config drift test. Fix a failure with:
 * pnpm --filter @powerhousedao/host-core emit-schemas */
describe("emitted host schemas drift", () => {
  for (const [file, schema] of Object.entries(emittedHostSchemas())) {
    it(`schemas/${file} is current`, () => {
      const committed = JSON.parse(
        readFileSync(path.join(schemasDir, file), "utf8"),
      ) as unknown;
      expect(committed).toEqual(schema);
    });
  }
});
