import { globSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { afterEach, beforeEach, expect, it } from "vitest";
import { vitestConfigTemplate } from "../../src/templates/index.mjs";
import { buildTsMorphProject } from "../../src/utils/index.mjs";
import {
  createPackage,
  generateCodeFirstDocumentModel,
  removePackage,
  todo,
} from "./package.js";

let dir: string;
beforeEach(async () => {
  dir = await createPackage();
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
});
afterEach(() => removePackage(dir));

const vitest = dirname(
  fileURLToPath(import.meta.resolve("vitest/package.json")),
);

it("measures the reducers of code-first and schema-first models, and nothing else", async () => {
  for (const file of [
    "document-models/invoice/v1/src/reducers/items.ts",
    "document-models/invoice/v1/gen/reducer.ts",
    "document-models/invoice/v1/tests/items.test.ts",
  ]) {
    mkdirSync(dirname(join(dir, file)), { recursive: true });
    writeFileSync(join(dir, file), "export {};\n");
  }
  symlinkSync(vitest, join(dir, "node_modules", "vitest"), "junction");
  writeFileSync(join(dir, "vitest.config.ts"), vitestConfigTemplate);

  const { default: config } = (await import(
    pathToFileURL(join(dir, "vitest.config.ts")).href
  )) as { default: { test: { coverage: { include: string[] } } } };
  const measured = globSync(config.test.coverage.include, {
    cwd: dir,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"),
    )
    .sort();

  expect(measured).toEqual([
    "document-models/invoice/v1/src/reducers/items.ts",
    "document-models/todo-list/v1/modules/items.ts",
  ]);
});
