// @vitest-environment node
import type { PowerhouseConfig } from "@powerhousedao/config";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { useFakePackageManager } from "../../../../codegen/test/fake-package-manager.js";
import { materializeFixturePackage } from "../../../../document-model/test/tooling/loader-contract.js";
import { SubgraphGenerator } from "../document-handlers/generators/subgraph-generator.js";

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

function freshProject(): string {
  const { root, dispose } = materializeFixturePackage("configs");
  disposals.push(dispose);
  writeFileSync(join(root, "powerhouse.config.json"), "{}");
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "@acme/fresh",
      version: "0.0.0",
      type: "module",
      peerDependencies: { "document-model": "6.2.3" },
    }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        moduleResolution: "nodenext",
        target: "esnext",
        strict: false,
        skipLibCheck: true,
      },
      include: ["subgraphs/**/*.ts"],
    }),
  );
  writeFileSync(
    join(root, "powerhouse.manifest.json"),
    JSON.stringify({ name: "@acme/fresh", subgraphs: [] }),
  );
  return root;
}

function confirmedSubgraph(name: string) {
  return {
    documentId: "subgraph-1",
    documentType: "powerhouse/subgraph",
    scope: "global",
    branch: "main",
    state: { global: { name, status: "CONFIRMED" } },
  };
}

it("installs reactor-api before it checks the subgraph it scaffolds in a fresh project", async () => {
  const root = freshProject();
  const fake = useFakePackageManager();
  disposals.push(fake.restore);
  const generator = new SubgraphGenerator(
    { PH_CONFIG: {} as PowerhouseConfig, CURRENT_WORKING_DIR: root },
    buildTsMorphProject(root),
  );

  await generator.generate(confirmedSubgraph("invoices"));

  expect(fake.calls()).toEqual([
    { command: "npm", args: ["i"], reactorApiBefore: false },
  ]);
  expect(
    (
      JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
        peerDependencies: Record<string, string>;
      }
    ).peerDependencies,
  ).toEqual({
    "@powerhousedao/reactor-api": "6.2.3",
    "document-model": "6.2.3",
  });
  expect(
    (
      JSON.parse(
        readFileSync(join(root, "powerhouse.manifest.json"), "utf8"),
      ) as { subgraphs: unknown }
    ).subgraphs,
  ).toEqual([{ id: "invoices", name: "invoices" }]);
}, 180_000);
