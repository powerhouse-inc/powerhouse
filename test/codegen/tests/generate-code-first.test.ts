/* eslint-disable @typescript-eslint/await-thenable -- bun-types declares
   `expect(...).rejects.toThrow()` as returning `void`, but it returns a
   promise; dropping these awaits would stop the assertions from running. */
import {
  generateAllDocumentModels,
  generateAllSubgraphs,
  generateCodeFirstDocumentModel,
  generateCodeFirstSubgraph,
  generateSubgraph,
} from "@powerhousedao/codegen";
import {
  registerCodeFirstDefinitionSource,
  usesCodeFirstDefinitionSources,
} from "@powerhousedao/codegen/file-builders";
import { analyzeLegacySubgraph } from "@powerhousedao/codegen/migration";
import { buildTsMorphProject } from "@powerhousedao/codegen/utils";
import { describe, expect, it } from "bun:test";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NEW_PROJECT, TEST_OUTPUT } from "../constants.js";
import { cpForce, mkdirRecursive, rmForce, runTsc } from "../utils.js";

const parentOutDir = join(TEST_OUTPUT, "generate-code-first");
await rmForce(parentOutDir);
await mkdirRecursive(parentOutDir);

describe("code-first scaffolds", () => {
  it("creates and extends a versioned document-model tree", async () => {
    const outDir = join(parentOutDir, "document-model");
    await cpForce(NEW_PROJECT, outDir);

    const vscodeSettings = JSON.parse(
      await readFile(join(outDir, ".vscode/settings.json"), "utf8"),
    ) as Record<string, unknown>;
    expect(vscodeSettings).toMatchObject({
      "typescript.tsdk": "node_modules/typescript/lib",
      "typescript.enablePromptUseWorkspaceTsdk": true,
      "js/ts.tsdk.path": "node_modules/typescript/lib",
    });

    const firstProject = buildTsMorphProject(outDir);
    await generateCodeFirstDocumentModel(
      {
        id: "acme/invoice",
        name: "Invoice",
        extension: "invoice",
      },
      firstProject,
    );
    await firstProject.save();

    const customReducerPath = join(
      outDir,
      "document-models/invoice/v1/reducers.ts",
    );
    const customReducer = `${await readFile(customReducerPath, "utf8")}\n// InvoiceV1 remains part of this v1 compatibility note.\n`;
    await writeFile(customReducerPath, customReducer);
    const authoredAsset = Uint8Array.from([0, 1, 118, 49, 255]);
    await writeFile(
      join(outDir, "document-models/invoice/v1/tests/fixture.bin"),
      authoredAsset,
    );
    const authoredAssets = join(
      outDir,
      "document-models/invoice/v1/assets/nested",
    );
    await mkdirRecursive(authoredAssets);
    await writeFile(
      join(outDir, "document-models/invoice/v1/helper.tsx"),
      `export const InvoiceV1Badge = () => <span>InvoiceV1</span>;

export function preserveUnrelated(
  defineDocumentModel: (input: { version: number }) => unknown,
  expect: (actual: number) => { toBe(expected: number): void },
  anything: { version: number },
): void {
  defineDocumentModel({ version: 1 });
  expect(anything.version).toBe(1);
}
`,
    );
    await writeFile(join(authoredAssets, "payload.bin"), authoredAsset);

    const secondProject = buildTsMorphProject(outDir);
    await generateCodeFirstDocumentModel(
      {
        id: "acme/invoice",
        name: "Invoice",
        extension: "invoice",
        version: 2,
      },
      secondProject,
    );
    await secondProject.save();

    const v1Reducer = await readFile(customReducerPath, "utf8");
    const v2Reducer = await readFile(
      join(outDir, "document-models/invoice/v2/reducers.ts"),
      "utf8",
    );
    expect(v1Reducer).toContain("InvoiceV1 remains");
    expect(v2Reducer).toContain("InvoiceV1 remains");
    expect(v2Reducer).not.toContain("InvoiceV2 remains");
    expect(
      await readFile(
        join(outDir, "document-models/invoice/v2/tests/fixture.bin"),
      ),
    ).toEqual(Buffer.from(authoredAsset));
    expect(
      await readFile(
        join(outDir, "document-models/invoice/v2/assets/nested/payload.bin"),
      ),
    ).toEqual(Buffer.from(authoredAsset));
    const copiedHelper = await readFile(
      join(outDir, "document-models/invoice/v2/helper.tsx"),
      "utf8",
    );
    expect(copiedHelper).toContain("InvoiceV2Badge");
    expect(copiedHelper).toContain("<span>InvoiceV1</span>");
    expect(copiedHelper).toContain("defineDocumentModel({ version: 1 })");
    expect(copiedHelper).toContain("expect(anything.version).toBe(1)");

    const family = await readFile(
      join(outDir, "document-models/invoice/index.ts"),
      "utf8",
    );
    expect(family).toContain("invoiceV1Definition");
    expect(family).toContain("invoiceV2Definition");
    expect(family).toContain("InvoiceFamily.at(2)");
    expect(family).toContain("InvoiceFamily.upgradeManifest");

    expect(
      (await readdir(join(outDir, "document-models/invoice"))).sort(),
    ).toEqual(["index.ts", "upgrades", "v1", "v2"]);
    expect(
      (await readdir(join(outDir, "document-models/invoice/v1"))).sort(),
    ).toEqual(["assets", "helper.tsx", "model.ts", "reducers.ts", "tests"]);
    expect(
      (await readdir(join(outDir, "document-models/invoice/v2"))).sort(),
    ).toEqual(["assets", "helper.tsx", "model.ts", "reducers.ts", "tests"]);
    expect(
      (await readdir(join(outDir, "document-models/invoice/v1/tests"))).sort(),
    ).toEqual(["fixture.bin", "model.test.ts"]);
    expect(
      (await readdir(join(outDir, "document-models/invoice/upgrades"))).sort(),
    ).toEqual(["index.ts", "v2.test.ts", "v2.ts"]);

    const upgrade = await readFile(
      join(outDir, "document-models/invoice/upgrades/v2.ts"),
      "utf8",
    );
    expect(upgrade).toContain("upgradeToV2");
    expect(
      await readFile(
        join(outDir, "document-models/invoice/upgrades/v2.test.ts"),
        "utf8",
      ),
    ).toContain("runs the upgrade reducer");

    const aggregate = await readFile(
      join(outDir, "document-models/document-models.ts"),
      "utf8",
    );
    expect(aggregate).toContain("InvoiceV1");
    expect(aggregate).toContain("InvoiceV2");
    const aggregateIndex = await readFile(
      join(outDir, "document-models/index.ts"),
      "utf8",
    );
    expect(aggregateIndex).toContain("./invoice/index.js");
    const upgradeManifests = await readFile(
      join(outDir, "document-models/upgrade-manifests.ts"),
      "utf8",
    );
    expect(upgradeManifests).toContain('from "document-models/invoice"');

    const config = JSON.parse(
      await readFile(join(outDir, "powerhouse.config.json"), "utf8"),
    ) as {
      definitionSources: {
        mode: string;
        entries: Array<{ specifier: string; exportPath: string[] }>;
      };
    };
    expect(config.definitionSources.mode).toBe("code-first");
    expect(config.definitionSources.entries).toEqual([
      {
        specifier: "./document-models/invoice/index.ts",
        exportPath: ["InvoiceV1"],
      },
      {
        specifier: "./document-models/invoice/index.ts",
        exportPath: ["InvoiceV2"],
      },
    ]);

    const freshProject = buildTsMorphProject(outDir);
    await generateAllDocumentModels(freshProject);
    await freshProject.save();
    const manifest = JSON.parse(
      await readFile(join(outDir, "powerhouse.manifest.json"), "utf8"),
    ) as { documentModels: Array<{ id: string }> };
    expect(manifest.documentModels.map(({ id }) => id)).toContain(
      "acme/invoice",
    );

    await runTsc(outDir);
  });

  it("creates a single-file typed subgraph without overwriting it", async () => {
    const outDir = join(parentOutDir, "subgraph");
    await cpForce(NEW_PROJECT, outDir);

    const firstProject = buildTsMorphProject(outDir);
    await generateSubgraph("legacy-status", firstProject);
    await generateCodeFirstSubgraph("invoice-status", firstProject);
    await firstProject.save();

    const subgraphPath = join(outDir, "subgraphs/invoice-status/index.ts");
    const customSubgraph = `${await readFile(subgraphPath, "utf8")}\n// retained author edit\n`;
    await writeFile(subgraphPath, customSubgraph);

    const secondProject = buildTsMorphProject(outDir);
    await generateCodeFirstSubgraph("invoice-status", secondProject);
    await secondProject.save();
    const retainedSubgraph = await readFile(subgraphPath, "utf8");
    expect(retainedSubgraph).toContain("retained author edit");
    expect(retainedSubgraph).toContain("resolve()");
    expect(retainedSubgraph).not.toContain("SubgraphArgs");
    expect(retainedSubgraph).not.toContain("services:");
    expect(retainedSubgraph).not.toContain("access:");
    expect(retainedSubgraph).not.toContain("builder.access");
    expect(
      (await readdir(join(outDir, "subgraphs/invoice-status"))).sort(),
    ).toEqual(["index.test.ts", "index.ts"]);

    const config = JSON.parse(
      await readFile(join(outDir, "powerhouse.config.json"), "utf8"),
    ) as {
      definitionSources: {
        entries: Array<{ specifier: string; exportPath: string[] }>;
      };
    };
    expect(config.definitionSources.entries).toEqual([
      {
        specifier: "./subgraphs/invoice-status/index.ts",
        exportPath: ["InvoiceStatusSubgraph"],
      },
    ]);

    const index = await readFile(join(outDir, "subgraphs/index.ts"), "utf8");
    expect(index).toContain("export * as InvoiceStatusSubgraph");
    expect(index).toContain("export * as LegacyStatusSubgraph");

    const freshProject = buildTsMorphProject(outDir);
    await generateAllSubgraphs(freshProject);
    await freshProject.save();
    const manifest = JSON.parse(
      await readFile(join(outDir, "powerhouse.manifest.json"), "utf8"),
    ) as { subgraphs: Array<{ id: string }> };
    expect(manifest.subgraphs.map(({ id }) => id)).toContain("invoice-status");

    await runTsc(outDir);
  });

  it("rejects invalid model inputs before creating a partial version", async () => {
    const outDir = join(parentOutDir, "invalid-model");
    await cpForce(NEW_PROJECT, outDir);

    for (const args of [
      { id: "acme/invoice", name: "Invoice  Ledger" },
      { id: "acme/invoice", name: "Invoice", extension: "../invoice" },
      {
        id: "acme/invoice",
        name: "Invoice",
        version: Number.MAX_SAFE_INTEGER + 1,
      },
    ]) {
      const project = buildTsMorphProject(outDir);
      await expect(
        generateCodeFirstDocumentModel(args, project),
      ).rejects.toThrow();
    }

    const project = buildTsMorphProject(outDir);
    await expect(
      generateCodeFirstDocumentModel(
        {
          id: "acme/invoice",
          name: "Invoice",
          version: 2,
        },
        project,
      ),
    ).rejects.toThrow("Cannot scaffold v2 before v1 exists");
    await expect(
      readdir(join(outDir, "document-models/invoice")),
    ).rejects.toThrow();
  });

  it("rejects invalid subgraph names and definition source paths", async () => {
    const outDir = join(parentOutDir, "invalid-sources");
    await cpForce(NEW_PROJECT, outDir);
    const project = buildTsMorphProject(outDir);

    await expect(generateCodeFirstSubgraph("123", project)).rejects.toThrow(
      "must start with a letter",
    );
    await expect(
      registerCodeFirstDefinitionSource(outDir, {
        specifier: "./../outside.ts",
      }),
    ).rejects.toThrow("invalid code-first definition source");

    const configPath = join(outDir, "powerhouse.config.json");
    const config = JSON.parse(await readFile(configPath, "utf8")) as Record<
      string,
      unknown
    >;
    await writeFile(configPath, "[]\n");
    await expect(
      registerCodeFirstDefinitionSource(outDir, {
        specifier: "./document-models/invoice/index.ts",
      }),
    ).rejects.toThrow("root value must be a JSON object");
    expect(await readFile(configPath, "utf8")).toBe("[]\n");

    await writeFile(configPath, "{\n");
    await expect(
      registerCodeFirstDefinitionSource(outDir, {
        specifier: "./document-models/invoice/index.ts",
      }),
    ).rejects.toThrow("Cannot parse");
    expect(await readFile(configPath, "utf8")).toBe("{\n");

    config.definitionSources = {
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier: "./../outside.ts" }],
    };
    const malformed = `${JSON.stringify(config, null, 2)}\n`;
    await writeFile(configPath, malformed);
    await expect(usesCodeFirstDefinitionSources(outDir)).rejects.toThrow(
      "invalid definitionSources configuration",
    );
    await expect(
      registerCodeFirstDefinitionSource(outDir, {
        specifier: "./document-models/invoice/index.ts",
      }),
    ).rejects.toThrow("invalid definitionSources configuration");
    expect(await readFile(configPath, "utf8")).toBe(malformed);
  });

  it("does not create a conflicting aggregate subgraph export", async () => {
    const outDir = join(parentOutDir, "conflicting-subgraph-export");
    await cpForce(NEW_PROJECT, outDir);
    const indexPath = join(outDir, "subgraphs/index.ts");
    const authored =
      "export const InvoiceStatusSubgraph = { authored: true };\n";
    await writeFile(indexPath, authored);
    const project = buildTsMorphProject(outDir);

    await expect(
      generateCodeFirstSubgraph("invoice-status", project),
    ).rejects.toThrow("already exports that name");
    expect(await readFile(indexPath, "utf8")).toBe(authored);
  });

  it("preserves the imported gql binding in migration analysis", async () => {
    const root = join(parentOutDir, "legacy-gql-analysis");
    await mkdirRecursive(root);
    const sourcePath = join(root, "index.ts");
    await writeFile(
      sourcePath,
      `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import parseSchema from "graphql-tag";
import { schemaSource } from "./schema.js";
import { resolvers } from "./resolvers.js";

export class ExampleSubgraph extends BaseSubgraph {
  name = "example";
  hasSubscriptions = false;
  typeDefs = parseSchema(schemaSource);
  resolvers = resolvers;
}
`,
    );

    const analysis = analyzeLegacySubgraph({
      sourcePath,
      candidateDirectory: join(root, ".verification/example"),
    });
    expect(analysis.typeDefs).toMatchObject({
      kind: "gql-source",
      gql: {
        importSpecifier: "graphql-tag",
        kind: "default",
      },
    });
    expect(analysis.diagnostics).toEqual([]);
  });

  it("matches the imported BaseSubgraph binding exactly and rejects ambiguity", async () => {
    const root = join(parentOutDir, "legacy-class-analysis");
    await mkdirRecursive(root);
    const sourcePath = join(root, "index.ts");
    const candidateDirectory = join(root, ".verification/example");
    await writeFile(
      sourcePath,
      `import { BaseSubgraph as LegacyBase } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";
import { resolvers } from "./resolvers.js";

class FakeBaseSubgraph {}
class Lookalike extends FakeBaseSubgraph {}
export class ExampleSubgraph extends LegacyBase {
  name = "example";
  typeDefs = schema;
  resolvers = resolvers;
}
`,
    );

    expect(
      analyzeLegacySubgraph({ sourcePath, candidateDirectory }).className,
    ).toBe("ExampleSubgraph");

    await writeFile(
      sourcePath,
      `${await readFile(sourcePath, "utf8")}
export class SecondSubgraph extends LegacyBase {}
`,
    );
    expect(
      analyzeLegacySubgraph({ sourcePath, candidateDirectory }).diagnostics.map(
        ({ code }) => code,
      ),
    ).toContain("PH-MIGRATE-SUBGRAPH-CLASS-AMBIGUOUS");
  });

  it("rejects static or side-effecting legacy class members", async () => {
    const root = join(parentOutDir, "legacy-member-analysis");
    await mkdirRecursive(root);
    const sourcePath = join(root, "index.ts");
    await writeFile(
      sourcePath,
      `import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { schema } from "./schema.js";
import { resolvers } from "./resolvers.js";

export class ExampleSubgraph extends BaseSubgraph {
  static { globalThis.sideEffect = true; }
  static name = "example";
  typeDefs = schema;
  resolvers = resolvers;
  additionalContextFields = { requestId: "string" };
  async onDisconnect() { globalThis.sideEffect = false; }
}
`,
    );

    const codes = analyzeLegacySubgraph({
      sourcePath,
      candidateDirectory: join(root, ".verification/example"),
    }).diagnostics.map(({ code }) => code);
    expect(codes).toContain("PH-MIGRATE-SUBGRAPH-STATIC-BLOCK-UNSUPPORTED");
    expect(codes).toContain("PH-MIGRATE-SUBGRAPH-STATIC-MEMBER-UNSUPPORTED");
    expect(codes).toContain("PH-MIGRATE-SUBGRAPH-DEAD-MEMBER-NONEMPTY");
  });
});
