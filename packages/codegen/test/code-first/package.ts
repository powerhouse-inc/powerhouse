import {
  selectModelGeneration,
  type GenerateCodeFirstDocumentModelArgs,
} from "../../src/codegen/index.js";
import type { Project } from "ts-morph";
import { projectPath } from "../../src/utils/source-files.js";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createOrUpdateManifest } from "../../src/file-builders/manifest.js";
import {
  documentModelsIndexTemplate,
  documentModelsTemplate,
  upgradeManifestsTemplate,
} from "../../src/templates/index.mjs";
import { ViteTypeScriptSourceImportAdapter } from "../../src/utils/definition-source-importer.js";
import { buildTsMorphProject, formatSafe } from "../../src/utils/index.mjs";

const require = createRequire(import.meta.url);

const packagesDir = fileURLToPath(new URL("../../../", import.meta.url));

export const schemaFirstSpecPath = join(
  packagesDir,
  "vetra/document-models/subgraph-module/subgraph-module.json",
);

export const todo = {
  name: "todo list",
  documentType: "acme/todo-list",
  author: { name: "acme", website: null },
} as const;

export async function createPackage(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "ph-code-first-"));
  mkdirSync(join(dir, "node_modules", "@powerhousedao"), { recursive: true });
  symlinkSync(
    join(packagesDir, "document-model"),
    join(dir, "node_modules", "document-model"),
    "junction",
  );
  symlinkSync(
    join(packagesDir, "shared"),
    join(dir, "node_modules", "@powerhousedao", "shared"),
    "junction",
  );
  writeFileSync(
    join(dir, "package.json"),
    JSON.stringify({ name: "@acme/things", type: "module" }),
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "nodenext",
        target: "esnext",
        strict: true,
        skipLibCheck: true,
        verbatimModuleSyntax: true,
        noEmit: true,
      },
      exclude: ["node_modules", "**/tests/**"],
    }),
  );
  writeFileSync(join(dir, "powerhouse.config.json"), "{}\n");
  await createOrUpdateManifest({ name: "@acme/things" }, dir);
  mkdirSync(join(dir, "document-models"));
  for (const [name, template] of [
    ["index.ts", documentModelsIndexTemplate],
    ["document-models.ts", documentModelsTemplate],
    ["upgrade-manifests.ts", upgradeManifestsTemplate],
  ] as const) {
    writeFileSync(
      join(dir, "document-models", name),
      await formatSafe(template),
    );
  }
  return dir;
}

export function removePackage(dir: string) {
  rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
}

export function tree(root: string): Record<string, string> {
  return Object.fromEntries(
    readdirSync(root, { recursive: true, withFileTypes: true })
      .filter(
        (entry) => entry.isFile() && !entry.parentPath.includes("node_modules"),
      )
      .map((entry): [string, string] => {
        const path = join(entry.parentPath, entry.name);
        return [
          relative(root, path).replaceAll("\\", "/"),
          readFileSync(path, "utf8"),
        ];
      }),
  );
}

export const read = (dir: string, path: string) =>
  readFileSync(join(dir, path), "utf8");

export const readJson = (dir: string, path: string): Record<string, unknown> =>
  JSON.parse(read(dir, path)) as Record<string, unknown>;

export function writeConfig(dir: string, config: unknown) {
  writeFileSync(
    join(dir, "powerhouse.config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

export function copySchemaFirstSpec(dir: string) {
  copyFileSync(schemaFirstSpecPath, join(dir, "subgraph-module.json"));
  return join(dir, "subgraph-module.json");
}

export async function inProject<T>(
  dir: string,
  generate: (project: ReturnType<typeof buildTsMorphProject>) => Promise<T>,
): Promise<T> {
  const project = buildTsMorphProject(dir);
  const result = await generate(project);
  await project.save();
  return result;
}

export function typeCheck(dir: string): string {
  return execFileSync(
    process.execPath,
    [
      join(dirname(require.resolve("typescript/package.json")), "bin/tsc"),
      "-p",
      dir,
    ],
    { encoding: "utf8" },
  );
}

export async function importSource(
  dir: string,
  specifier: `./${string}`,
): Promise<Record<string, unknown>> {
  const importer = new ViteTypeScriptSourceImportAdapter();
  try {
    return {
      ...(await importer.importModule({
        packageRoot: dir,
        specifier,
        packageRevision: `sha256:${"1".repeat(64)}`,
      })),
    };
  } finally {
    await importer.disposeRevision();
  }
}

export function addTodoListVersion2(dir: string) {
  const model = join(dir, "document-models/todo-list");
  const replaceIn = (file: string, from: string, to: string) => {
    const text = readFileSync(join(model, file), "utf8");
    if (!text.includes(from)) throw new Error(`${file} lacks ${from}`);
    writeFileSync(join(model, file), text.replace(from, to));
  };
  cpSync(join(model, "v1"), join(model, "v2"), { recursive: true });
  replaceIn("v2/definition.ts", "version: 1,", "version: 2,");
  replaceIn(
    "v2/index.ts",
    "export const todoListV1",
    "export const todoListV2",
  );
  replaceIn("upgrades/index.ts", "[1] as const", "[1, 2] as const");
  replaceIn(
    "upgrades/index.ts",
    "upgrades: {},",
    "upgrades: { v2: { toVersion: 2, upgradeReducer: (document) => document } },",
  );
  replaceIn(
    "index.ts",
    'import { todoListV1 } from "./v1/index.js";',
    'import { todoListV1 } from "./v1/index.js";\nimport { todoListV2 } from "./v2/index.js";',
  );
  replaceIn(
    "index.ts",
    "versions: [todoListV1]",
    "versions: [todoListV1, todoListV2]",
  );
  replaceIn(
    "index.ts",
    "export const TodoList = TodoListV1;",
    "export const TodoListV2 = family.at(2);\n\nexport const TodoList = TodoListV2;",
  );
}

export function generateCodeFirstDocumentModel(
  args: GenerateCodeFirstDocumentModelArgs,
  project: Project,
) {
  return selectModelGeneration({
    projectDir: projectPath(project, "."),
    codeFirst: true,
  }).scaffoldDocumentModel(args, project);
}
