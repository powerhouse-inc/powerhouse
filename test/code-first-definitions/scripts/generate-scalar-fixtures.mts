#!/usr/bin/env node
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { collectScalarConformanceActual } from "../src/evidence/scalar-conformance.js";
import { sha256, writeJson } from "../src/evidence/utils.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryRoot = resolve(packageRoot, "../..");
const fixtureRoot = resolve(packageRoot, "fixtures/scalars/v1");

async function dependency(gate: "B1" | "B6" | "B9", path: string) {
  const [fixture, contract] = await Promise.all([
    readFile(resolve(packageRoot, path)),
    readFile(resolve(repositoryRoot, "cf-spec/08-implementation-plan.md")),
  ]);
  return {
    gate,
    contractRevision: sha256(contract),
    fixtureManifestDigest: sha256(fixture),
  };
}

await mkdir(fixtureRoot, { recursive: true });
const actual = collectScalarConformanceActual();
const scalarInventory = JSON.parse(
  await readFile(
    resolve(packageRoot, "fixtures/model-sdl/v1/scalar-inventory-digest.json"),
    "utf8",
  ),
) as unknown;
await Promise.all([
  writeJson(resolve(fixtureRoot, "definitions.json"), actual.definitions),
  writeJson(
    resolve(fixtureRoot, "current-coercion-goldens.json"),
    actual.goldens,
  ),
  writeJson(resolve(fixtureRoot, "difference-list.json"), {
    kind: "powerhouse.scalar-difference-list",
    formatVersion: 1,
    differences: actual.differences,
  }),
  writeJson(
    resolve(fixtureRoot, "scalar-inventory-digest.json"),
    scalarInventory,
  ),
]);

if (!process.argv.includes("--artifacts-only")) {
  const fixtureSchema = await readFile(
    resolve(packageRoot, "schemas/gate-fixture-manifest-v1.schema.json"),
  );
  const directDependencies = await Promise.all([
    dependency("B1", "fixtures/definitions/v1/manifest.json"),
    dependency("B6", "fixtures/model-sdl/v1/manifest.json"),
    dependency(
      "B9",
      "fixtures/reproductions/v1/failure-propagation/manifest.json",
    ),
  ]);
  const cases = actual.definitions.flatMap((definition, definitionIndex) => {
    const common = {
      scalarName: definition.name,
      definitionIndex,
      outcomeIndex: definitionIndex,
    };
    return [
      {
        caseId: `${definition.name}--validation`,
        profile: "document-engineering-1.40",
        ...common,
      },
      {
        caseId: `${definition.name}--graphql`,
        profile: "legacy-graphql-default-v1",
        ...common,
      },
    ];
  });
  await writeJson(resolve(fixtureRoot, "manifest.json"), {
    kind: "powerhouse.gate-fixture-manifest",
    formatVersion: 1,
    gate: "B14",
    fixtureVersion: "scalar-conformance-v1",
    caseCount: cases.length,
    requiredTools: {
      node: process.version,
      documentEngineering: "1.40.5",
      graphql: "16.12.0",
    },
    schemaDigest: sha256(fixtureSchema),
    directDependencies,
    scalarInventory: "./scalar-inventory-digest.json",
    cases,
  });
}

process.stderr.write(
  `Generated ${actual.definitions.length} scalar definitions and ${actual.goldens.length} coercion goldens.\n`,
);
