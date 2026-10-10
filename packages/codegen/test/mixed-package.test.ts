import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Project } from "ts-morph";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateAll,
  generateAllDocumentModels,
  generateCodeFirstDocumentModel,
  generateCodeFirstSubgraph,
  generateDocumentModel,
  generateEditor,
  generateSubgraph,
} from "../src/codegen/generate.js";
import { loadDocumentModel } from "../src/codegen/utils.js";
import { buildTsMorphProject } from "../src/utils/index.mts";
import { createCodeFirstPackage } from "./code-first-package.js";

const TEST_DOC_JSON = fileURLToPath(
  new URL(
    "../../../test/codegen/data/document-models/test-doc/test-doc.json",
    import.meta.url,
  ),
);

let projectDir: string;
let enteredFrom: string;

const read = (file: string) => readFileSync(join(projectDir, file), "utf8");

async function inProject(generate: (project: Project) => Promise<unknown>) {
  const project = buildTsMorphProject(projectDir);
  await generate(project);
  await project.save();
}

function selectDefinitionSources(definitionSources: unknown) {
  writeFileSync(
    join(projectDir, "powerhouse.config.json"),
    `${JSON.stringify({ documentModelsDir: "./document-models", definitionSources }, null, 2)}\n`,
  );
}

const generateTestDoc = async () => {
  const state = await loadDocumentModel(TEST_DOC_JSON);
  await inProject((project) => generateDocumentModel(state, project));
};

const scaffoldCustomer = () =>
  inProject((project) =>
    generateCodeFirstDocumentModel(
      {
        name: "customer",
        documentType: "acme-things/customer",
        author: { name: "acme-things", website: null },
      },
      project,
    ),
  );

const AGGREGATES = ["index.ts", "document-models.ts", "upgrade-manifests.ts"];

const removeAggregates = () => {
  for (const name of AGGREGATES)
    rmSync(join(projectDir, "document-models", name), { force: true });
};

const aggregates = () => ({
  index: read("document-models/index.ts"),
  documentModels: read("document-models/document-models.ts"),
  upgradeManifests: read("document-models/upgrade-manifests.ts"),
});

const UNREGISTERED_CUSTOMER =
  '⚠ PH-CONFIG-SOURCE-UNREGISTERED [error/configuration] <config> /definitionSources/entries: ./document-models/customer/ declares a code-first document model that definitionSources does not list, so the package leaves it out. Expected: an entry for ./document-models/customer/index.ts Received: no entry Repair: Set definitionSources in powerhouse.config.json to { "formatVersion": 1, "mode": "code-first", "entries": [{ "specifier": "./document-models/customer/index.ts" }] }. Schema-first models keep generating from their model documents.';

beforeEach(() => {
  enteredFrom = process.cwd();
  projectDir = createCodeFirstPackage();
});

afterEach(() => {
  vi.restoreAllMocks();
  process.chdir(enteredFrom);
  rmSync(projectDir, { recursive: true, force: true });
});

describe("a schema-first package that adds a code-first model", () => {
  it("exports both after the schema-first model is generated again", async () => {
    await generateTestDoc();
    await scaffoldCustomer();
    await generateTestDoc();
    expect(aggregates()).toStrictEqual({
      index: `import * as codeFirstSource0 from "./customer/index.js";

export * from "./customer/index.js";
export { TestDoc as TestDocV1 } from "./test-doc/v1/module.js";

export const codeFirstDocumentModel0_0 =
  codeFirstSource0["customerFamily"]["modules"]["0"];

export { documentModels } from "./document-models.js";
export { upgradeManifests } from "./upgrade-manifests.js";
`,
      documentModels: `import { TestDoc as TestDocV1 } from "document-models/test-doc/v1";
import * as documentModelsCodeFirst0 from "./customer/index.js";

/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */

export const documentModels = [
  TestDocV1,
  documentModelsCodeFirst0["customerFamily"]["modules"]["0"],
] as const;
`,
      upgradeManifests: `/**
 * WARNING: DO NOT EDIT
 * This file is auto-generated and updated by codegen
 */
import type { UpgradeManifest } from "document-model";
import { testDocUpgradeManifest } from "document-models/test-doc/upgrades";
import * as upgradeManifestsCodeFirst0 from "./customer/index.js";

export const upgradeManifests: UpgradeManifest<readonly number[]>[] = [
  testDocUpgradeManifest,
  upgradeManifestsCodeFirst0["customerFamily"]["upgradeManifest"],
];
`,
    });
  });

  it("generates the same aggregates whether definitionSources is absent, schema-first, or empty", async () => {
    await generateTestDoc();
    const schemaFirstOnly = aggregates();
    selectDefinitionSources({ formatVersion: 1, mode: "schema-first" });
    removeAggregates();
    await generateTestDoc();
    expect(aggregates()).toStrictEqual(schemaFirstOnly);
    selectDefinitionSources({
      formatVersion: 1,
      mode: "code-first",
      entries: [],
    });
    removeAggregates();
    await generateTestDoc();
    expect(aggregates()).toStrictEqual(schemaFirstOnly);
  });

  it("warns about an unregistered code-first model and ships none of it", async () => {
    await generateTestDoc();
    const schemaFirstOnly = aggregates();
    await scaffoldCustomer();
    selectDefinitionSources({ formatVersion: 1, mode: "schema-first" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await generateTestDoc();
    expect(warn.mock.calls).toStrictEqual([[UNREGISTERED_CUSTOMER]]);
    expect(aggregates()).toStrictEqual(schemaFirstOnly);
  });

  it("generates a schema-first model despite a config it cannot parse, like a package without definitionSources", async () => {
    await generateTestDoc();
    const schemaFirstOnly = aggregates();
    writeFileSync(
      join(projectDir, "powerhouse.config.json"),
      '\uFEFF{ "documentModelsDir": "./document-models", }\n',
    );
    removeAggregates();
    await generateTestDoc();
    expect(aggregates()).toStrictEqual(schemaFirstOnly);
  });

  it("does not call a registered model unregistered when the config cannot be parsed", async () => {
    await generateTestDoc();
    await scaffoldCustomer();
    writeFileSync(
      join(projectDir, "powerhouse.config.json"),
      `${read("powerhouse.config.json").trimEnd().slice(0, -1)},}\n`,
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await generateTestDoc();
    expect(
      warn.mock.calls.filter(([text]) =>
        String(text).includes("PH-CONFIG-SOURCE-UNREGISTERED"),
      ),
    ).toStrictEqual([]);
    expect(read("powerhouse.config.json")).toContain(
      "./document-models/customer/index.ts",
    );
  });

  it("warns when the code-first entry list is left empty", async () => {
    await generateTestDoc();
    await scaffoldCustomer();
    selectDefinitionSources({
      formatVersion: 1,
      mode: "code-first",
      entries: [],
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await generateTestDoc();
    expect(warn.mock.calls).toStrictEqual([
      [
        UNREGISTERED_CUSTOMER.replace(
          /Repair: .*/,
          'Repair: Add { "specifier": "./document-models/customer/index.ts" } to definitionSources.entries in powerhouse.config.json.',
        ),
      ],
    ]);
  });

  it("keeps a schema-first model whole when its folder holds an unregistered code-first file", async () => {
    await generateTestDoc();
    const schemaFirstOnly = aggregates();
    writeFileSync(
      join(projectDir, "document-models/test-doc/draft.ts"),
      'import { defineDocumentModel } from "document-model";\nexport const draft = defineDocumentModel({});\n',
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    removeAggregates();
    await generateTestDoc();
    expect(aggregates()).toStrictEqual(schemaFirstOnly);
    expect(
      warn.mock.calls.map(([text]) =>
        String(text).replace(/ Expected: .*/, ""),
      ),
    ).toStrictEqual([
      "⚠ PH-CONFIG-SOURCE-UNREGISTERED [error/configuration] <config> /definitionSources/entries: ./document-models/test-doc/draft.ts declares a code-first document model that definitionSources does not list, so the package leaves it out.",
    ]);
  });

  it("warns once per unregistered model during bulk generation", async () => {
    await generateTestDoc();
    await scaffoldCustomer();
    selectDefinitionSources({ formatVersion: 1, mode: "schema-first" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const unregisteredWarnings = () =>
      warn.mock.calls.filter(([text]) =>
        String(text).includes("PH-CONFIG-SOURCE-UNREGISTERED"),
      );
    await inProject(generateAll);
    expect(unregisteredWarnings()).toStrictEqual([[UNREGISTERED_CUSTOMER]]);
    warn.mockClear();
    await inProject((project) => generateAllDocumentModels(project));
    expect(unregisteredWarnings()).toStrictEqual([[UNREGISTERED_CUSTOMER]]);
  });

  it("warns about an unregistered subgraph when one subgraph is generated", async () => {
    await inProject((project) => generateCodeFirstSubgraph("orders", project));
    selectDefinitionSources({ formatVersion: 1, mode: "schema-first" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await inProject((project) => generateSubgraph("billing", project));
    expect(warn.mock.calls).toStrictEqual([
      [
        '⚠ PH-CONFIG-SOURCE-UNREGISTERED [error/configuration] <config> /definitionSources/entries: ./subgraphs/orders.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out. Expected: an entry for ./subgraphs/orders.ts Received: no entry Repair: Set definitionSources in powerhouse.config.json to { "formatVersion": 1, "mode": "code-first", "entries": [{ "specifier": "./subgraphs/orders.ts" }] }. Schema-first models keep generating from their model documents.',
      ],
    ]);
  });

  it("names an entry whose file is missing", async () => {
    await generateTestDoc();
    selectDefinitionSources({
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./document-models/customer/index.ts" }],
    });
    await expect(generateTestDoc()).rejects.toThrow(
      "definitionSources in powerhouse.config.json lists ./document-models/customer/index.ts, which does not exist. Fix the specifier or remove the entry.",
    );
  });

  it("names the unregistered model when an editor targets its type", async () => {
    await scaffoldCustomer();
    selectDefinitionSources({ formatVersion: 1, mode: "schema-first" });
    await expect(
      inProject((project) =>
        generateEditor(
          {
            editorId: "customer-editor",
            editorName: "CustomerEditor",
            documentTypes: ["acme-things/customer"],
            editorDirName: undefined,
          },
          project,
        ),
      ),
    ).rejects.toThrow(
      "Failed to get document type metadata for document type: acme-things/customer. If a code-first model declares it, register that model in definitionSources in powerhouse.config.json. Unregistered: ./document-models/customer/index.ts.",
    );
  });
});
