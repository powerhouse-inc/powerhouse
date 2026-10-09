import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export function createCodeFirstPackage(): string {
  const projectDir = mkdtempSync(join(tmpdir(), "ph-code-first-"));
  mkdirSync(join(projectDir, "document-models"), { recursive: true });
  mkdirSync(join(projectDir, "node_modules", "@powerhousedao"), {
    recursive: true,
  });
  symlinkSync(
    fileURLToPath(new URL("../../document-model", import.meta.url)),
    join(projectDir, "node_modules", "document-model"),
    "junction",
  );
  for (const name of ["shared", "reactor-api"])
    symlinkSync(
      fileURLToPath(new URL(`../../${name}`, import.meta.url)),
      join(projectDir, "node_modules", "@powerhousedao", name),
      "junction",
    );
  writeFileSync(
    join(projectDir, "package.json"),
    JSON.stringify({ name: "@acme/things", type: "module" }),
  );
  writeFileSync(
    join(projectDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { module: "nodenext", moduleResolution: "nodenext" },
    }),
  );
  writeFileSync(
    join(projectDir, "powerhouse.config.json"),
    `${JSON.stringify({ documentModelsDir: "./document-models" }, null, 2)}\n`,
  );
  return projectDir;
}

/** Adds version 2 to the `task` model `generateCodeFirstDocumentModel` scaffolds. */
export function addTaskVersion2(projectDir: string) {
  const path = (file: string) => join(projectDir, file);
  const replaceIn = (file: string, from: string, to: string) => {
    const text = readFileSync(path(file), "utf8");
    if (!text.includes(from)) throw new Error(`${file} lacks ${from}`);
    writeFileSync(path(file), text.replaceAll(from, to));
  };
  cpSync(path("document-models/task/v1"), path("document-models/task/v2"), {
    recursive: true,
  });
  replaceIn(
    "document-models/task/v2/definition.ts",
    "version: 1,",
    "version: 2,",
  );
  replaceIn(
    "document-models/task/v2/index.ts",
    "taskV1Definition",
    "taskV2Definition",
  );
  writeFileSync(
    path("document-models/task/upgrades/v2.ts"),
    [
      'import type { UpgradeTransition } from "document-model";',
      "",
      "export const v2: UpgradeTransition = {",
      "  toVersion: 2,",
      "  upgradeReducer: (document) => document,",
      "};",
      "",
    ].join("\n"),
  );
  replaceIn(
    "document-models/task/upgrades/versions.ts",
    "[1] as const",
    "[1, 2] as const",
  );
  replaceIn(
    "document-models/task/upgrades/upgrade-manifest.ts",
    'from "./versions.js";',
    'from "./versions.js";\nimport { v2 } from "./v2.js";',
  );
  replaceIn(
    "document-models/task/upgrades/upgrade-manifest.ts",
    "upgrades: {},",
    "upgrades: { v2 },",
  );
  replaceIn(
    "document-models/task/index.ts",
    'import { taskV1Definition } from "./v1/index.js";',
    'import { taskV1Definition } from "./v1/index.js";\nimport { taskV2Definition } from "./v2/index.js";',
  );
  replaceIn(
    "document-models/task/index.ts",
    "versions: [taskV1Definition]",
    "versions: [taskV1Definition, taskV2Definition]",
  );
  replaceIn(
    "document-models/task/index.ts",
    "export const taskV1 = taskFamily.at(1);",
    "export const taskV1 = taskFamily.at(1);\nexport const taskV2 = taskFamily.at(2);",
  );
  replaceIn("document-models/task/index.ts", "[taskV1];", "[taskV1, taskV2];");
}
