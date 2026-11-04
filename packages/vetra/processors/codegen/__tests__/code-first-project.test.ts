// @vitest-environment node
import { selectModelGeneration } from "@powerhousedao/codegen";
import { createOrUpdateManifest } from "@powerhousedao/codegen/file-builders";
import {
  documentModelsIndexTemplate,
  documentModelsTemplate,
  upgradeManifestsTemplate,
} from "@powerhousedao/codegen/templates";
import { buildTsMorphProject, formatSafe } from "@powerhousedao/codegen/utils";
import type { PowerhouseConfig } from "@powerhousedao/config";
import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { extractDocumentModelDocuments } from "../../../codegen/schema-first/extract-document-models.js";
import { DocumentModelGenerator } from "../document-handlers/generators/schema-first/document-model-generator.js";

const vetraDir = fileURLToPath(new URL("../../../", import.meta.url));
const packagesDir = join(vetraDir, "..");

const storedSpec = JSON.parse(
  readFileSync(
    join(vetraDir, "document-models/subgraph-module/subgraph-module.json"),
    "utf8",
  ),
) as DocumentModelGlobalState;

let dir: string;

async function createCodeFirstPackage(): Promise<string> {
  const root = mkdtempSync(join(tmpdir(), "vetra-code-first-"));
  mkdirSync(join(root, "node_modules", "@powerhousedao"), { recursive: true });
  symlinkSync(
    join(packagesDir, "document-model"),
    join(root, "node_modules", "document-model"),
    "junction",
  );
  symlinkSync(
    join(packagesDir, "shared"),
    join(root, "node_modules", "@powerhousedao", "shared"),
    "junction",
  );
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "@acme/things", type: "module" }),
  );
  writeFileSync(
    join(root, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        target: "esnext",
        strict: true,
        skipLibCheck: true,
        noEmit: true,
      },
      exclude: ["node_modules"],
    }),
  );
  writeFileSync(join(root, "powerhouse.config.json"), "{}\n");
  await createOrUpdateManifest({ name: "@acme/things" }, root);
  mkdirSync(join(root, "document-models"));
  for (const [name, template] of [
    ["index.ts", documentModelsIndexTemplate],
    ["document-models.ts", documentModelsTemplate],
    ["upgrade-manifests.ts", upgradeManifestsTemplate],
  ] as const) {
    writeFileSync(
      join(root, "document-models", name),
      await formatSafe(template),
    );
  }
  const project = buildTsMorphProject(root);
  await selectModelGeneration({
    projectDir: root,
    codeFirst: true,
  }).scaffoldDocumentModel(
    {
      name: "todo list",
      documentType: "acme/todo-list",
      author: { name: "acme", website: null },
    },
    project,
  );
  await project.save();
  return root;
}

function files(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && !entry.parentPath.includes("node_modules"),
      )
      .map((entry): [string, string] => {
        const path = join(entry.parentPath, entry.name);
        return [relative(root, path), readFileSync(path, "utf8")];
      })
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

beforeEach(async () => {
  dir = await createCodeFirstPackage();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
});

describe("Vetra codegen in a code-first package", () => {
  it("refuses a document model document that would overwrite a code-first model, writing nothing", async () => {
    const before = files(dir);
    const generator = new DocumentModelGenerator(
      { PH_CONFIG: {} as PowerhouseConfig, CURRENT_WORKING_DIR: dir },
      buildTsMorphProject(dir),
    );
    await expect(
      generator.generate({
        documentId: "doc-1",
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: "main",
        state: {
          global: { ...storedSpec, id: "acme/imported", name: "Todo List" },
        },
      }),
    ).rejects.toThrow(
      'the schema-first model "Todo List" would overwrite document-models/todo-list/index.ts',
    );
    expect(files(dir)).toStrictEqual(before);
  });

  it("extracts only the stored model directories", () => {
    mkdirSync(join(dir, "document-models", "subgraph-module"));
    writeFileSync(
      join(dir, "document-models", "subgraph-module", "subgraph-module.json"),
      JSON.stringify(storedSpec),
    );
    expect(
      extractDocumentModelDocuments(buildTsMorphProject(dir)).map(
        (document) => document.header.name,
      ),
    ).toEqual(["Subgraph Module"]);
  });
});
