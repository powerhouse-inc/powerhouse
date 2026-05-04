// Regenerates the committed JSON Schema artifacts that GitHub serves via raw
// URLs (referenced by `$schema` fields in source and runtime config files).
// Run with: pnpm tsx scripts/emit-schemas.ts
//
// The TypeScript constants in source-config-schema.ts and
// runtime-config-schema.ts are the source of truth; this script serialises
// them to JSON files alongside their TS counterparts.
//
// Re-run whenever either schema constant changes. Bump the `schema-v<N>`
// git tag and update RUNTIME_CONFIG_SCHEMA_URL when schemaVersion bumps.

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runtimeConfigSchema } from "@powerhousedao/builder-tools";
import { sourceConfigSchema } from "@powerhousedao/shared/clis";

const here = resolve(fileURLToPath(import.meta.url), "..");
const repoRoot = resolve(here, "..");

const targets: { path: string; schema: unknown }[] = [
  {
    path: resolve(
      repoRoot,
      "packages/builder-tools/connect-utils/runtime-config.schema.json",
    ),
    schema: runtimeConfigSchema,
  },
  {
    path: resolve(repoRoot, "packages/shared/clis/source-config.schema.json"),
    schema: sourceConfigSchema,
  },
];

for (const { path, schema } of targets) {
  writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`, "utf-8");
  console.log(`wrote ${path}`);
}
