import { createDocument, saveSpec } from "@powerhousedao/vetra/codegen";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { useFakePackageManager } from "../../../packages/codegen/test/fake-package-manager.js";
import { materializeFixturePackage } from "../../../packages/document-model/test/tooling/loader-contract.js";
import { startGenerateSubgraph } from "../src/services/generate-subgraph.js";

const disposals: (() => void)[] = [];
const enteredFrom = process.cwd();
afterEach(() => {
  process.chdir(enteredFrom);
  for (const dispose of disposals.splice(0)) dispose();
});

function packageManager(links?: Readonly<Record<string, string>>) {
  const fake = useFakePackageManager(links);
  disposals.push(fake.restore);
  return fake;
}

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

const args = {
  name: undefined,
  document: undefined,
  dir: undefined,
  all: false,
  extract: false,
  skipInstall: false,
  debug: undefined,
};

const read = (root: string, file: string) =>
  readFileSync(join(root, file), "utf8");

const manifestSubgraphs = (root: string) =>
  (JSON.parse(read(root, "powerhouse.manifest.json")) as { subgraphs: unknown })
    .subgraphs;

it("installs reactor-api before it checks the first subgraph of a fresh project", async () => {
  const root = freshProject();
  const fake = packageManager();

  await startGenerateSubgraph({ ...args, name: "invoices" }, root);

  expect(fake.calls()).toEqual([
    { command: "npm", args: ["i"], reactorApiBefore: false },
  ]);
  expect(manifestSubgraphs(root)).toEqual([
    { id: "invoices", name: "invoices" },
  ]);
}, 180_000);

it("installs reactor-api before it checks a subgraph generated from a document", async () => {
  const root = freshProject();
  const fake = packageManager();
  const doc = createDocument("powerhouse/subgraph", {
    name: "invoices",
    initialState: { global: { name: "invoices", status: "CONFIRMED" } },
  });
  const spec = await saveSpec(doc, root);

  await startGenerateSubgraph({ ...args, document: spec }, root);

  expect(fake.calls()).toEqual([
    { command: "npm", args: ["i"], reactorApiBefore: false },
  ]);
  expect(
    (
      JSON.parse(read(root, "package.json")) as {
        peerDependencies: Record<string, string>;
      }
    ).peerDependencies,
  ).toEqual({
    "@powerhousedao/reactor-api": "6.2.3",
    "document-model": "6.2.3",
  });
  expect(manifestSubgraphs(root)).toEqual([
    { id: "invoices", name: "invoices" },
  ]);
}, 180_000);

it("keeps the manifest when the check fails after the install", async () => {
  const root = freshProject();
  packageManager({});
  const manifest = read(root, "powerhouse.manifest.json");

  await expect(
    startGenerateSubgraph({ ...args, name: "invoices" }, root),
  ).rejects.toThrow("Kept every subgraphs entry in powerhouse.manifest.json");

  expect(read(root, "powerhouse.manifest.json")).toBe(manifest);
}, 180_000);

it("names the package to install when --skip-install leaves reactor-api missing", async () => {
  const root = freshProject();
  const fake = packageManager();
  const manifest = read(root, "powerhouse.manifest.json");

  const failure = startGenerateSubgraph(
    { ...args, name: "invoices", skipInstall: true },
    root,
  );

  await expect(failure).rejects.toThrow(
    "PH-IMPORT-FAILED [error/import] ./subgraphs/invoices/index.ts (root): This definition source needs the package @powerhousedao/reactor-api, which is not installed.",
  );
  await expect(failure).rejects.toThrow(
    "Repair: Install @powerhousedao/reactor-api: list it in package.json and run your package manager's install, then run the definition check again.",
  );
  expect(fake.calls()).toEqual([]);
  expect(read(root, "powerhouse.manifest.json")).toBe(manifest);
}, 180_000);
