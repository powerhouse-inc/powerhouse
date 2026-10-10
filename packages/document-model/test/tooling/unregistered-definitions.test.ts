import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { resolveDefinitionSelection } from "../../src/definition/tooling/definition-source-resolution.js";
import {
  findCodeFirstDefinitions,
  unregisteredDefinitionDiagnostics,
} from "../../src/definition/tooling/unregistered-definitions.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true });
});

function packageWith(
  definitionSources: unknown,
  files: Record<string, string>,
): string {
  const root = mkdtempSync(join(tmpdir(), "ph-unregistered-"));
  roots.push(root);
  writeFileSync(
    join(root, "powerhouse.config.json"),
    JSON.stringify(
      definitionSources === undefined ? {} : { definitionSources },
    ),
  );
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  }
  return root;
}

function unregistered(root: string) {
  return unregisteredDefinitionDiagnostics(
    resolveDefinitionSelection({
      configFile: join(root, "powerhouse.config.json"),
    }),
  ).map(({ message, repair }) => ({ message, repair }));
}

const SCHEMA_FIRST_INVOICE = {
  "document-models/invoice/invoice.json": "{}",
  "document-models/invoice/v1/module.ts": "export const module = {};",
  "subgraphs/invoice/index.ts":
    "export class InvoiceSubgraph extends BaseSubgraph {}",
};

const CODE_FIRST_CUSTOMER = {
  "document-models/customer/v1/definition.ts":
    'import { defineDocumentModel } from "document-model";\nexport const customer = defineDocumentModel({});',
  "document-models/customer/index.ts":
    'import { defineDocumentModelFamily } from "document-model";\nimport { customer } from "./v1/definition.js";\nexport const family = defineDocumentModelFamily({ versions: [customer] });',
};

const CODE_FIRST_ORDERS = {
  "subgraphs/orders.ts":
    'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport default defineSubgraph({});',
};

describe("unregistered code-first definitions", () => {
  it("finds none in a schema-first package", () => {
    const root = packageWith(
      { formatVersion: 1, mode: "schema-first" },
      SCHEMA_FIRST_INVOICE,
    );
    expect(unregistered(root)).toEqual([]);
  });

  it("finds none when every code-first root is registered", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [
          { specifier: "./document-models/customer/index.ts" },
          { specifier: "./subgraphs/orders.ts" },
        ],
      },
      { ...SCHEMA_FIRST_INVOICE, ...CODE_FIRST_CUSTOMER, ...CODE_FIRST_ORDERS },
    );
    expect(unregistered(root)).toEqual([]);
  });

  it("names a model and a subgraph a package without definitionSources leaves out", () => {
    const root = packageWith(undefined, {
      ...SCHEMA_FIRST_INVOICE,
      ...CODE_FIRST_CUSTOMER,
      ...CODE_FIRST_ORDERS,
    });
    expect(unregistered(root)).toEqual([
      {
        message:
          "./document-models/customer/ declares a code-first document model that definitionSources does not list, so the package leaves it out.",
        repair:
          'Set definitionSources in powerhouse.config.json to { "formatVersion": 1, "mode": "code-first", "entries": [{ "specifier": "./document-models/customer/index.ts" }] }. Schema-first models keep generating from their model documents.',
      },
      {
        message:
          "./subgraphs/orders.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
        repair:
          'Set definitionSources in powerhouse.config.json to { "formatVersion": 1, "mode": "code-first", "entries": [{ "specifier": "./subgraphs/orders.ts" }] }. Schema-first models keep generating from their model documents.',
      },
    ]);
  });

  it("follows an entry's re-exports, and only those", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/definitions.ts" }],
      },
      {
        ...CODE_FIRST_CUSTOMER,
        ...CODE_FIRST_ORDERS,
        "subgraphs/returns.ts":
          'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport default defineSubgraph({});',
        "src/definitions.ts":
          'export * from "../document-models/customer/index.js";\nexport { default as orders } from "../subgraphs/orders";',
      },
    );
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./subgraphs/returns.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
    ]);
  });

  it("reads declarations from imports, not from comments, and skips dependencies", () => {
    const root = packageWith(undefined, {
      ...SCHEMA_FIRST_INVOICE,
      "subgraphs/invoice/notes.ts":
        "// Example: defineSubgraph({ name: 'x' })\nexport const notes = 'defineDocumentModel(';",
      "subgraphs/node_modules/dep/index.ts":
        'import { defineSubgraph } from "@powerhousedao/reactor-api";',
      "subgraphs/commented.ts":
        '// import { defineSubgraph } from "@powerhousedao/reactor-api";\nimport { type defineSubgraph } from "@powerhousedao/reactor-api";\nexport const usage = \'import { defineSubgraph } from "@powerhousedao/reactor-api"\';',
      "subgraphs/aliased.ts":
        'import { defineSubgraph as make } from "@powerhousedao/reactor-api";\nexport default make({});',
    });
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./subgraphs/aliased.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
    ]);
  });

  it("counts only a value path to a file that declares the definition", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/definitions.ts" }],
      },
      {
        ...CODE_FIRST_CUSTOMER,
        ...CODE_FIRST_ORDERS,
        "subgraphs/returns.ts":
          'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport default defineSubgraph({});',
        "document-models/customer/helper.ts": "export const helper = 1;",
        "src/definitions.ts": [
          'import { helper } from "../document-models/customer/helper.js";',
          'export type { customer } from "../document-models/customer/v1/definition.js";',
          '// export * from "../document-models/customer/index.js";',
          'export { type family } from "../document-models/customer/index.js";',
          "export const hint = 'export * from \"../document-models/customer/index.js\"';",
          "export const orders = (await import(`../subgraphs/orders.js`)).default",
          "export type Returns = string",
          'export * from "../subgraphs/returns.js"',
        ].join("\n"),
      },
    );
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./document-models/customer/ declares a code-first document model that definitionSources does not list, so the package leaves it out.",
    ]);
  });

  it("keeps comment markers inside strings as text", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/index.ts" }],
      },
      {
        ...CODE_FIRST_ORDERS,
        "src/index.ts": [
          'export const accept = "image/*";',
          "export const path = `${accept}//`;",
          'export * from "../subgraphs/orders.js";',
          "/** Docs. */",
        ].join("\n"),
      },
    );
    expect(unregistered(root)).toEqual([]);
  });

  it("skips a directory entry, an unreadable file, and an unreadable folder", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./subgraphs" }],
      },
      CODE_FIRST_ORDERS,
    );
    symlinkSync(join(root, "missing.ts"), join(root, "subgraphs", "old.ts"));
    mkdirSync(join(root, "document-models", "locked"), { recursive: true });
    const locked = join(root, "document-models", "locked");
    chmodSync(locked, 0o000);
    try {
      expect(unregistered(root).map(({ message }) => message)).toEqual([
        "./subgraphs/orders.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
      ]);
    } finally {
      chmodSync(locked, 0o755);
    }
  });

  it("reaches a definition through a symlinked entry", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/orders.ts" }],
      },
      CODE_FIRST_ORDERS,
    );
    mkdirSync(join(root, "src"));
    symlinkSync(
      join(root, "subgraphs", "orders.ts"),
      join(root, "src", "orders.ts"),
    );
    expect(unregistered(root)).toEqual([]);
  });

  it("suggests the declaring module when the folder index does not reach it", () => {
    const root = packageWith(undefined, {
      "document-models/customer/index.ts": "export const helper = 1;",
      "document-models/customer/v1/definition.ts":
        'import { defineDocumentModel } from "document-model";\nexport const customer = defineDocumentModel({});',
    });
    expect(unregistered(root).map(({ repair }) => repair)).toEqual([
      'Set definitionSources in powerhouse.config.json to { "formatVersion": 1, "mode": "code-first", "entries": [{ "specifier": "./document-models/customer/v1/definition.ts" }] }. Schema-first models keep generating from their model documents.',
    ]);
  });

  it("does not read a regular expression as an import", () => {
    const pattern =
      'export const pattern = /import { defineDocumentModel } from "document-model"/;\nexport const half = 4 / 2 / 1;';
    const root = packageWith(undefined, {
      "document-models/matcher/index.ts": pattern,
      "document-models/customer/index.ts": `${pattern}\nimport { defineDocumentModel } from "document-model";\nexport const customer = defineDocumentModel({});`,
    });
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./document-models/customer/ declares a code-first document model that definitionSources does not list, so the package leaves it out.",
    ]);
  });

  it("counts a factory call, not an import of the factory", () => {
    const root = packageWith(undefined, {
      "subgraphs/helpers.ts":
        'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport { defineSubgraph };\nexport type Builder = typeof defineSubgraph<[]>;',
      "subgraphs/typed.ts":
        'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport const typed = defineSubgraph<{ name: string }>({ name: "typed" });',
      "subgraphs/namespaced.ts":
        'import * as reactor from "@powerhousedao/reactor-api";\nexport default reactor.defineSubgraph({});',
    });
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./subgraphs/namespaced.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
      "./subgraphs/typed.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
    ]);
  });

  it("follows a re-export after a regular expression and of a value named type", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/index.ts" }],
      },
      {
        ...CODE_FIRST_ORDERS,
        "subgraphs/returns.ts":
          'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport const type = defineSubgraph({});',
        "src/index.ts": [
          "export const special = /[/*]/;",
          'export * from "../subgraphs/orders.js";',
          'export { type as Returns } from "../subgraphs/returns.js";',
        ].join("\n"),
      },
    );
    expect(unregistered(root)).toEqual([]);
    expect(findCodeFirstDefinitions(root)).toHaveLength(2);
  });

  it("skips test files and follows index.mts and .jsx specifiers through escaped regular expressions", () => {
    const subgraph =
      'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport default defineSubgraph({});';
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./src/index.ts" }],
      },
      {
        "subgraphs/orders/orders.test.ts": subgraph,
        "subgraphs/orders/__tests__/fixture.ts": subgraph,
        "subgraphs/views/index.mts": subgraph,
        "subgraphs/view.tsx": subgraph,
        "src/index.ts": [
          "const tick = /\\`/;",
          "const star = /a\\/*/;",
          'export * from "../subgraphs/views";',
          'export * from "../subgraphs/view.jsx";',
        ].join("\n"),
      },
    );
    expect(unregistered(root)).toEqual([]);
    expect(findCodeFirstDefinitions(root)).toHaveLength(2);
  });

  it("treats each subgraph module in a folder as its own definition", () => {
    const subgraph =
      'import { defineSubgraph } from "@powerhousedao/reactor-api";\nexport default defineSubgraph({});';
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./subgraphs/orders/a.ts" }],
      },
      { "subgraphs/orders/a.ts": subgraph, "subgraphs/orders/b.ts": subgraph },
    );
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./subgraphs/orders/b.ts declares a code-first subgraph that definitionSources does not list, so no definition check covers it and powerhouse.manifest.json leaves it out.",
    ]);
  });

  it("asks a code-first package to add the entry it is missing", () => {
    const root = packageWith(
      {
        formatVersion: 1,
        mode: "code-first",
        entries: [{ specifier: "./subgraphs/orders.ts" }],
      },
      { ...CODE_FIRST_CUSTOMER, ...CODE_FIRST_ORDERS },
    );
    expect(unregistered(root)).toEqual([
      {
        message:
          "./document-models/customer/ declares a code-first document model that definitionSources does not list, so the package leaves it out.",
        repair:
          'Add { "specifier": "./document-models/customer/index.ts" } to definitionSources.entries in powerhouse.config.json.',
      },
    ]);
  });

  it("warns about what a --source subset leaves out instead of failing", () => {
    const root = packageWith(undefined, {
      ...CODE_FIRST_CUSTOMER,
      ...CODE_FIRST_ORDERS,
    });
    const diagnostics = unregisteredDefinitionDiagnostics(
      resolveDefinitionSelection({
        configFile: join(root, "powerhouse.config.json"),
        cliSources: ["./subgraphs/orders.ts"],
      }),
    );
    expect(
      diagnostics.map(({ code, severity, message, repair }) => ({
        code,
        severity,
        message,
        repair,
      })),
    ).toEqual([
      {
        code: "PH-CONFIG-SOURCE-UNSELECTED",
        severity: "warning",
        message:
          "./document-models/customer/ declares a code-first document model that the selected sources leave out, so this run does not check it.",
        repair:
          "Select it with another --source, or run without --source to check every registered definition.",
      },
    ]);
  });

  it("reports a code-first model written inside a schema-first model's folder", () => {
    const root = packageWith(undefined, {
      ...SCHEMA_FIRST_INVOICE,
      "document-models/invoice/v2/definition.ts":
        'import { defineDocumentModel } from "document-model";\nexport const invoiceV2 = defineDocumentModel({});',
    });
    expect(unregistered(root).map(({ message }) => message)).toEqual([
      "./document-models/invoice/v2/definition.ts declares a code-first document model that definitionSources does not list, so the package leaves it out.",
    ]);
  });
});
