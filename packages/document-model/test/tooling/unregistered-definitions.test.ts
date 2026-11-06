import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { findUnregisteredDefinitions } from "../../src/definition/tooling/project/unregistered-definitions.js";
import { writeFiles } from "./project-fixtures.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

function packageWith(files: Record<string, string>): string {
  const root = realpathSync.native(
    mkdtempSync(join(tmpdir(), "ph-unregistered-")),
  );
  roots.push(root);
  writeFiles(root, files);
  return root;
}

/**
 * `graph` maps each selected source to the package files its import
 * evaluated, as the import adapter reports them.
 */
function scan(
  root: string,
  graph: Readonly<Record<`./${string}`, readonly string[]>> = {},
  documentModelsDir = "document-models",
  loadedDocumentTypes: ReadonlySet<string> = new Set(),
) {
  return findUnregisteredDefinitions({
    packageRoot: root,
    documentModelsDir: join(root, documentModelsDir),
    sources: Object.keys(graph).map((specifier) => ({
      specifier: specifier as `./${string}`,
    })),
    importedFiles: (specifier) =>
      (graph[specifier as `./${string}`] ?? []).map((path) => join(root, path)),
    loadedDocumentTypes,
  });
}

function units(
  root: string,
  graph: Readonly<Record<`./${string}`, readonly string[]>> = {},
  documentModelsDir = "document-models",
) {
  return findUnregisteredDefinitions({
    packageRoot: root,
    documentModelsDir: join(root, documentModelsDir),
    sources: Object.keys(graph).map((specifier) => ({
      specifier: specifier as `./${string}`,
    })),
    importedFiles: (specifier) =>
      (graph[specifier as `./${string}`] ?? []).map((path) => join(root, path)),
    loadedDocumentTypes: new Set(),
  }).unregistered.map(({ unit, specifier }) => `${unit} -> ${specifier}`);
}

const DECLARES =
  'import { defineDocumentModel } from "document-model";\nexport default defineDocumentModel({});';

const CUSTOMER = {
  "document-models/customer/v1/definition.ts":
    'import { defineDocumentModel } from "document-model";\nexport const customer = defineDocumentModel({});',
  "document-models/customer/index.ts":
    'import { defineDocumentModelFamily } from "document-model";\nimport { customer } from "./v1/definition.js";\nexport const family = defineDocumentModelFamily({ versions: [customer] });',
};

describe("findUnregisteredDefinitions", () => {
  it("finds nothing in a schema-first package", () => {
    const root = packageWith({
      "document-models/invoice/invoice.json": "{}",
      "document-models/invoice/v1/module.ts": "export const module = {};",
    });
    expect(units(root)).toEqual([]);
  });

  it("counts every file the import graph reached, however the import was resolved", () => {
    const root = packageWith({
      ...CUSTOMER,
      "document-models/ledger/index.ts": DECLARES,
      "document-models/returns/index.ts": DECLARES,
      "package.json":
        '{ "imports": { "#ledger": "./document-models/ledger/index.ts" } }',
      "tsconfig.json":
        '{ "compilerOptions": { "paths": { "document-models/*": ["./document-models/*/index.ts"] } } }',
      "src/models.ts":
        'export { default as Ledger } from "#ledger";\nexport * from "document-models/customer";',
    });
    expect(
      units(root, {
        "./src/models.ts": [
          "src/models.ts",
          "document-models/ledger/index.ts",
          "document-models/customer/index.ts",
          "document-models/customer/v1/definition.ts",
        ],
      }),
    ).toEqual([
      "./document-models/returns/ -> ./document-models/returns/index.ts",
    ]);
  });

  it("counts a unit reached through any one of its declaring files", () => {
    const root = packageWith({
      ...CUSTOMER,
      "src/models.ts":
        'export { customer } from "../document-models/customer/v1/definition.js";',
    });
    expect(
      units(root, {
        "./src/models.ts": [
          "src/models.ts",
          "document-models/customer/v1/definition.ts",
        ],
      }),
    ).toEqual([]);
  });

  it("reports nothing while a selected source failed to import, since its reach is unknown", () => {
    const root = packageWith({
      "document-models/orders/index.ts": DECLARES,
      "document-models/returns/index.ts": DECLARES,
    });
    expect(
      units(root, {
        "./document-models/orders/index.ts": [
          "document-models/orders/index.ts",
        ],
        "./src/broken.ts": [],
      }),
    ).toEqual([]);
  });

  it("suggests the folder index when it declares, else the first declaring file", () => {
    const root = packageWith({
      ...CUSTOMER,
      "document-models/notes/index.ts": "export const helper = 1;",
      "document-models/notes/v1/definition.ts": DECLARES,
    });
    expect(units(root)).toEqual([
      "./document-models/customer/ -> ./document-models/customer/index.ts",
      "./document-models/notes/ -> ./document-models/notes/v1/definition.ts",
    ]);
  });

  it("reads declarations from imports, not from comments, strings or dependencies", () => {
    const root = packageWith({
      "document-models/notes/index.ts":
        "// Example: defineDocumentModel({ name: 'x' })\nexport const notes = 'defineDocumentModel(';",
      "document-models/node_modules/dep/index.ts": DECLARES,
      "document-models/commented/index.ts":
        '// import { defineDocumentModel } from "document-model";\nimport { type defineDocumentModel } from "document-model";\nexport const usage = \'import { defineDocumentModel } from "document-model"\';',
      "document-models/aliased/index.ts":
        'import { defineDocumentModel as make } from "document-model";\nexport default make({});',
      "document-models/pattern/index.ts":
        'export const pattern = /import { defineDocumentModel } from "document-model"/;\nexport const half = 4 / 2 / 1;',
    });
    expect(units(root)).toEqual([
      "./document-models/aliased/ -> ./document-models/aliased/index.ts",
    ]);
  });

  it("counts a factory call, not an import of the factory", () => {
    const root = packageWith({
      "document-models/helpers/index.ts":
        'import { defineDocumentModel } from "document-model";\nexport { defineDocumentModel };\nexport type Builder = typeof defineDocumentModel<[]>;',
      "document-models/typed/index.ts":
        'import { defineDocumentModel } from "document-model";\nexport const typed = defineDocumentModel<{ name: string }>({ name: "typed" });',
      "document-models/namespaced/index.ts":
        'import * as dm from "document-model";\nexport default dm.defineDocumentModel({});',
    });
    expect(units(root)).toEqual([
      "./document-models/namespaced/ -> ./document-models/namespaced/index.ts",
      "./document-models/typed/ -> ./document-models/typed/index.ts",
    ]);
  });

  it("skips test files and dangling symlinks", () => {
    const root = packageWith({
      "document-models/orders/orders.test.ts": DECLARES,
      "document-models/orders/__tests__/fixture.ts": DECLARES,
    });
    symlinkSync(
      join(root, "missing.ts"),
      join(root, "document-models", "orders", "old.ts"),
    );
    symlinkSync(join(root, "missing"), join(root, "document-models", "gone"));
    expect(units(root)).toEqual([]);
  });

  it("scans a symlinked unit inside the package and skips one that leaves it", () => {
    const outside = packageWith({ "notes/index.ts": DECLARES });
    const root = packageWith({
      "models/stock/index.ts": DECLARES,
      "models/stock/v1/definition.ts": DECLARES,
    });
    mkdirSync(join(root, "document-models"));
    symlinkSync(
      join(root, "models", "stock"),
      join(root, "document-models", "stock"),
    );
    symlinkSync(
      join(root, "models", "stock"),
      join(root, "models", "stock", "v1", "loop"),
    );
    symlinkSync(join(outside, "notes"), join(root, "document-models", "notes"));
    expect(units(root)).toEqual([
      "./document-models/stock/ -> ./document-models/stock/index.ts",
    ]);
    expect(
      units(root, {
        "./src/models.ts": ["src/models.ts", "models/stock/index.ts"],
      }),
    ).toEqual([]);
  });

  it("scans the configured models directory only", () => {
    const root = packageWith({ "models/orders/index.ts": DECLARES });
    expect(units(root)).toEqual([]);
    expect(units(root, {}, "models")).toEqual([
      "./models/orders/ -> ./models/orders/index.ts",
    ]);
  });

  it("scans every module file a definition source can name", () => {
    const root = packageWith({
      "document-models/a/index.js": DECLARES,
      "document-models/b/index.mjs": DECLARES,
      "document-models/c/index.jsx": DECLARES,
      "document-models/d/index.mts": DECLARES,
      "document-models/e/index.cjs": DECLARES,
      "document-models/f/index.d.ts": DECLARES,
      "document-models/g/index.test.js": DECLARES,
    });
    expect(units(root)).toEqual([
      "./document-models/a/ -> ./document-models/a/index.js",
      "./document-models/b/ -> ./document-models/b/index.mjs",
      "./document-models/c/ -> ./document-models/c/index.jsx",
      "./document-models/d/ -> ./document-models/d/index.mts",
    ]);
  });

  it("reports a reached unit whose literal id no selected source produced", () => {
    const declaring = (id: string) =>
      `import { defineDocumentModel } from "document-model";\nexport const model = defineDocumentModel({ scopes: { global: { id: "nested" } }, "id": ${JSON.stringify(id)} });`;
    const root = packageWith({
      "document-models/ledger/index.ts": declaring("example/ledger"),
      "document-models/orders/index.ts": declaring("example/orders"),
      "document-models/computed/index.ts":
        'import { defineDocumentModel } from "document-model";\nconst id = "example/computed";\nexport const model = defineDocumentModel({ id });',
    });
    const graph = {
      "./document-models/ledger/index.ts": [
        "document-models/ledger/index.ts",
        "document-models/orders/index.ts",
        "document-models/computed/index.ts",
      ],
    };
    const reasons = (loaded: readonly string[]) =>
      scan(root, graph, "document-models", new Set(loaded)).unregistered.map(
        ({ unit, reason }) => `${unit} ${reason}`,
      );
    expect(reasons(["example/ledger"])).toEqual([
      "./document-models/orders/ not-exported",
    ]);
    expect(reasons(["example/ledger", "example/orders"])).toEqual([]);
    expect(reasons(["example/ledger", "nested"])).toEqual([
      "./document-models/orders/ not-exported",
    ]);
  });

  it("does not report a reached unit whose id its source text cannot settle", () => {
    const declaring = (members: string) =>
      `import { defineDocumentModel } from "document-model";\nexport const model = defineDocumentModel({ ${members} });`;
    const root = packageWith({
      "document-models/escaped/index.ts": declaring(
        String.raw`id: "example/\u006eotes"`,
      ),
      "document-models/spread/index.ts": declaring(
        'id: "example/base", ...{ id: "example/notes" }',
      ),
      "document-models/overridden/index.ts": declaring(
        'id: "example/base", id: noteId',
      ),
      "document-models/last/index.ts": declaring(
        'id: "example/base", id: "example/last"',
      ),
    });
    const files = [
      "document-models/escaped/index.ts",
      "document-models/spread/index.ts",
      "document-models/overridden/index.ts",
      "document-models/last/index.ts",
    ];
    expect(
      scan(
        root,
        { "./document-models/escaped/index.ts": files },
        "document-models",
        new Set(["example/notes"]),
      ).unregistered.map(({ unit, reason }) => `${unit} ${reason}`),
    ).toEqual(["./document-models/last/ not-exported"]);
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "reports a file or nested directory it cannot read, but leaves model directories to the stored-model reader",
    () => {
      const root = packageWith({
        "document-models/orders/index.ts": DECLARES,
        "document-models/orders/v1/definition.ts": DECLARES,
        "document-models/returns/index.ts": DECLARES,
      });
      const locked = [
        join(root, "document-models/orders/index.ts"),
        join(root, "document-models/orders/v1"),
        join(root, "document-models/returns"),
      ];
      for (const path of locked) chmodSync(path, 0o000);
      try {
        const result = scan(root);
        expect({
          unregistered: result.unregistered.map(({ unit }) => unit),
          unreadable: result.diagnostics.map(({ code, source }) => [
            code,
            source?.specifier,
          ]),
        }).toEqual({
          unregistered: [],
          unreadable: [
            ["PH-IMPORT-FAILED", "./document-models/orders/v1"],
            ["PH-IMPORT-FAILED", "./document-models/orders/index.ts"],
          ],
        });
      } finally {
        for (const path of locked) chmodSync(path, 0o755);
      }
    },
  );
});
