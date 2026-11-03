import type { Sha256Digest } from "@powerhousedao/shared/document-model";
import { DefinitionSourceLoader } from "document-model/tooling";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, parse, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadCodeFirstInventory } from "../../src/file-builders/document-model/code-first-inventory.js";
import { tsConfigTemplate } from "../../src/templates/index.mjs";
import { ViteTypeScriptSourceImportAdapter } from "../../src/utils/definition-source-importer.js";
import { buildTsMorphProject } from "../../src/utils/index.mjs";
import {
  createPackage,
  generateCodeFirstDocumentModel,
  removePackage,
  todo,
  writeConfig,
} from "./package.js";

let dir: string;
const made: string[] = [];
beforeEach(async () => {
  dir = await createPackage();
  made.push(dir);
  await generateCodeFirstDocumentModel(todo, buildTsMorphProject(dir));
});
afterEach(() => made.splice(0).forEach(removePackage));

const revision = (digit: string): Sha256Digest => `sha256:${digit.repeat(64)}`;

function write(root: string, path: string, text: string) {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), text);
}

/** A module that leaves `marker` behind if it is ever evaluated. */
const recordsRun = (marker: string) =>
  `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(marker)}, "ran");\nexport const TodoList = {};\n`;

/** Re-exports the scaffolded model from a module at `path` in the package. */
const reexportTodoList = (path: string) =>
  `export * from ${JSON.stringify(
    relative(
      dirname(join(dir, path)),
      join(dir, "document-models/todo-list/index.js"),
    ).replaceAll("\\", "/"),
  )};\n`;

function selectOnly(root: string, specifier: `./${string}`) {
  writeConfig(root, {
    definitionSources: {
      formatVersion: 1,
      mode: "code-first",
      entries: [{ specifier }],
    },
  });
}

async function load(root: string) {
  const loader = new DefinitionSourceLoader(
    new ViteTypeScriptSourceImportAdapter(),
  );
  try {
    const loaded = await loader.normalizeDefinitionSources({
      configFile: join(root, "powerhouse.config.json"),
      packageRevision: revision("1"),
    });
    return {
      status: loaded.status,
      diagnostics: loaded.diagnostics,
      models: loaded.documentModels.map(({ source, value }) => [
        source.specifier,
        value.documentModel.global.id,
      ]),
    };
  } finally {
    await loader.dispose();
  }
}

describe("the executed module is the checked package file", () => {
  it("runs a nested Vite filesystem-route source and its helper from the package, never from outside", async () => {
    const outside = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ph-importer-outside-")),
    );
    made.push(outside);
    const marker = join(outside, "ran");
    writeFileSync(join(outside, "model.ts"), recordsRun(marker));
    writeFileSync(join(outside, "helper.ts"), recordsRun(marker));
    const twin = `@fs/${relative(parse(outside).root, outside).replaceAll("\\", "/")}/model.ts`;
    write(
      dir,
      twin,
      `${reexportTodoList(twin)}export { helper } from "./helper.ts";\n`,
    );
    write(
      dir,
      join(dirname(twin), "helper.ts"),
      'export const helper = "package";\n',
    );
    selectOnly(dir, `./${twin}`);

    expect({
      ...(await load(dir)),
      outsideRan: existsSync(marker),
    }).toStrictEqual({
      status: "ready",
      diagnostics: [],
      models: [[`./${twin}`, "acme/todo-list"]],
      outsideRan: false,
    });
  });

  it.each([
    ["src/with space/a%20b.ts", "src/with space/a b.ts"],
    ["src/caf%C3%A9.ts", "src/café.ts"],
    ["nested/%2e%2e/model.ts", "model.ts"],
    ["src/100%25.ts", "src/100%.ts"],
  ])(
    "runs the literally named %s, not its decoded twin",
    async (literal, decoded) => {
      const marker = join(dir, "decoded-ran");
      write(dir, literal, reexportTodoList(literal));
      write(dir, decoded, recordsRun(marker));
      selectOnly(dir, `./${literal}`);

      expect({
        ...(await load(dir)),
        decodedRan: existsSync(marker),
      }).toStrictEqual({
        status: "ready",
        diagnostics: [],
        models: [[`./${literal}`, "acme/todo-list"]],
        decodedRan: false,
      });
    },
  );

  it("refuses a package whose path Vite would cut at '#', and never runs the file the cut names", async () => {
    const parent = realpathSync.native(
      mkdtempSync(join(tmpdir(), "ph-importer-")),
    );
    made.push(parent);
    const root = join(parent, "acme#things");
    renameSync(dir, root);
    const marker = join(parent, "cut-ran");
    writeFileSync(join(parent, "acme"), recordsRun(marker));

    const loaded = await load(root);
    expect({
      status: loaded.status,
      codes: loaded.diagnostics.map(({ code }) => code),
      cutRan: existsSync(marker),
    }).toStrictEqual({
      status: "failed",
      codes: ["PH-IMPORT-FAILED"],
      cutRan: false,
    });
    expect(loaded.diagnostics[0]?.received).toContain(
      join(root, "document-models/todo-list/index.ts"),
    );
  });
});

describe("project tsconfig paths", () => {
  beforeEach(() => {
    // The tsconfig ph init writes, comments and all.
    writeFileSync(join(dir, "tsconfig.json"), tsConfigTemplate);
  });

  it("loads a model whose definition imports through the scalars alias", async () => {
    write(dir, "scalars/index.ts", 'export const itemLabel = "label";\n');
    const definition = join(dir, "document-models/todo-list/v1/definition.ts");
    writeFileSync(
      definition,
      readFileSync(definition, "utf8")
        .replace(
          'import { defineDocumentModel, ph } from "document-model";',
          'import { defineDocumentModel, ph } from "document-model";\nimport { itemLabel } from "scalars";',
        )
        .replace(
          "label: ph.String({ required: true }),",
          "[itemLabel]: ph.String({ required: true }),",
        ),
    );

    const inventory = await loadCodeFirstInventory(dir);
    expect(
      inventory.documentModels.map(
        ({ documentType, name, version, binding }) => ({
          documentType,
          name,
          version,
          binding,
        }),
      ),
    ).toStrictEqual([
      {
        documentType: "acme/todo-list",
        name: "Todo List",
        version: 1,
        binding: {
          specifier: "./document-models/todo-list/index.ts",
          exportName: "TodoList",
        },
      },
    ]);
  });

  it("sees an edited helper behind the alias in the next revision, as one module with its physical path", async () => {
    write(dir, "scalars/index.ts", 'export * from "./label.ts";\n');
    write(
      dir,
      "scalars/label.ts",
      'export const label = "first";\nexport const state = {};\n',
    );
    write(
      dir,
      "src/labels.ts",
      [
        'import { label, state as viaAlias } from "scalars";',
        'import { state as viaPath } from "../scalars/index.ts";',
        "export const shared = viaAlias === viaPath;",
        "export { label };",
        "",
      ].join("\n"),
    );
    const importer = new ViteTypeScriptSourceImportAdapter();
    const importAt = async (digit: string) => {
      const { label, shared } = await importer.importModule({
        packageRoot: dir,
        specifier: "./src/labels.ts",
        packageRevision: revision(digit),
      });
      return { label, shared };
    };
    try {
      const first = await importAt("a");
      write(
        dir,
        "scalars/label.ts",
        'export const label = "edited";\nexport const state = {};\n',
      );
      expect([first, await importAt("b")]).toStrictEqual([
        { label: "first", shared: true },
        { label: "edited", shared: true },
      ]);
    } finally {
      await importer.disposeRevision();
    }
  });
});

describe("revisions", () => {
  it("keeps the current evaluation when a stale revision is disposed, and evaluates afresh after the current one is", async () => {
    write(dir, "src/state.ts", "export const state = {};\n");
    const importer = new ViteTypeScriptSourceImportAdapter();
    const state = async () =>
      (
        await importer.importModule({
          packageRoot: dir,
          specifier: "./src/state.ts",
          packageRevision: revision("b"),
        })
      ).state;
    try {
      const first = await state();
      await importer.disposeRevision(revision("a"));
      const afterStale = await state();
      await importer.disposeRevision(revision("b"));
      const afterCurrent = await state();
      expect([afterStale === first, afterCurrent === first]).toStrictEqual([
        true,
        false,
      ]);
    } finally {
      await importer.disposeRevision();
    }
  });
});

it("reports a broken project alias without recommending a nonexistent npm package", async () => {
  write(dir, "tsconfig.json", tsConfigTemplate);
  write(
    dir,
    "src/broken.ts",
    `${reexportTodoList("src/broken.ts")}import "scalars";\n`,
  );
  selectOnly(dir, "./src/broken.ts");
  const loaded = await load(dir);
  expect(loaded.status).toBe("failed");
  expect(loaded.diagnostics[0]?.repair).toContain("tsconfig");
  expect(loaded.diagnostics[0]?.message).not.toContain(
    "which is not installed",
  );
  expect(loaded.diagnostics[0]?.repair).not.toContain("Install scalars");
});
