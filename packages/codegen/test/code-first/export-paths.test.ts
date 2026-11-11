import { renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeDocumentModelAggregates } from "../../src/file-builders/document-model/aggregates.js";
import { loadDocumentModelInventory } from "../../src/file-builders/document-model/document-model-inventory.js";
import { buildTsMorphProject } from "../../src/utils/index.mjs";
import {
  createPackage,
  generateCodeFirstDocumentModel,
  importSource,
  inProject,
  read,
  removePackage,
  todo,
} from "./package.js";

let dir: string;
beforeEach(async () => {
  dir = await createPackage();
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
});
afterEach(() => removePackage(dir));

describe("aggregates for a definition under an all-digit key", () => {
  it.each([
    ["a leading zero", "01", (value: string) => `{ "01": ${value} }`],
    [
      "more digits than a double holds",
      "9007199254740993",
      (value: string) => `{ "9007199254740993": ${value} }`,
    ],
    ["an array position", "0", (value: string) => `[${value}]`],
  ])("read the exact key with %s", async (_, key, holding) => {
    const model = join(dir, "document-models/todo-list");
    renameSync(join(model, "index.ts"), join(model, "family.ts"));
    writeFileSync(
      join(model, "index.ts"),
      [
        'import { TodoList, todoListUpgradeManifest } from "./family.js";',
        `export const models = ${holding("TodoList")};`,
        `export const manifests = ${holding("todoListUpgradeManifest")};`,
        "",
      ].join("\n"),
    );
    writeFileSync(
      join(dir, "check.ts"),
      [
        'import { documentModels } from "./document-models/document-models.js";',
        'import { TodoListV1 } from "./document-models/index.js";',
        'import { upgradeManifests } from "./document-models/upgrade-manifests.js";',
        'import { manifests, models } from "./document-models/todo-list/index.js";',
        "export const model = Object.values(models)[0];",
        "export const manifest = Object.values(manifests)[0];",
        "export const emittedModel = documentModels[0];",
        "export const emittedName = TodoListV1;",
        "export const emittedManifest = upgradeManifests[0];",
        "export const counts = [documentModels.length, upgradeManifests.length];",
        "",
      ].join("\n"),
    );

    await inProject(dir, async (project) =>
      writeDocumentModelAggregates(
        project,
        await loadDocumentModelInventory(dir),
      ),
    );

    const check = await importSource(dir, "./check.ts");
    expect(check.model).toBeTypeOf("object");
    expect(check.manifest).toBeTypeOf("object");
    expect(check.emittedModel).toBe(check.model);
    expect(check.emittedName).toBe(check.model);
    expect(check.emittedManifest).toBe(check.manifest);
    expect(check.counts).toStrictEqual([1, 1]);
    const access = `[${JSON.stringify(key)}]`;
    expect(read(dir, "document-models/index.ts")).toContain(
      `export const TodoListV1 = codeFirstSource0.models${access};`,
    );
    expect(read(dir, "document-models/upgrade-manifests.ts")).toContain(
      `codeFirstSource0.manifests${access}`,
    );
  });
});
