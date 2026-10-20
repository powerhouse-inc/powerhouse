import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { emittedRunnerSchemas } from "../src/runners/emitted-schemas.js";

const schemasDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "schemas",
);

const EMIT = "pnpm --filter @powerhousedao/ph-cli emit-schemas";

/** The committed runner schemas must match the live zod schemas. Fix a
 * failure with `pnpm --filter @powerhousedao/ph-cli emit-schemas`. */
describe("emitted runner schemas drift", () => {
  for (const [file, schema] of Object.entries(emittedRunnerSchemas())) {
    it(`schemas/${file} is current`, () => {
      const committed = JSON.parse(
        readFileSync(path.join(schemasDir, file), "utf8"),
      ) as unknown;
      expect(
        committed,
        `schemas/${file} is behind its runner's zod schema; run \`${EMIT}\``,
      ).toEqual(schema);
    });
  }
});
