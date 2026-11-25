import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, posix, relative } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  migrateDocumentModel,
  regenerateDocumentModelBarrels,
  type DocumentModelMigration,
} from "../../src/codegen/index.js";
import {
  boardModel,
  generateStoredModel,
  ledgerModel,
} from "./document-model-migration-fixture.js";
import {
  createPackage,
  importSource,
  read,
  removePackage,
  typeCheck,
} from "./package.js";

let dir: string;
beforeEach(async () => {
  dir = await createPackage();
  // Real projects resolve document-models/<dir> through tsconfig paths.
  const tsconfig = JSON.parse(read(dir, "tsconfig.json")) as {
    compilerOptions: Record<string, unknown>;
  };
  tsconfig.compilerOptions.paths = {
    "document-models/*": ["./document-models/*/index.ts"],
  };
  writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
  // Generated schema-first code imports zod, so every such project has it.
  symlinkSync(
    realpathSync(
      fileURLToPath(new URL("../../node_modules/zod", import.meta.url)),
    ),
    join(dir, "node_modules", "zod"),
    "junction",
  );
});
afterEach(() => removePackage(dir));

const model = (version: number) => `document-models/ledger/v${version}`;

function write(path: string, text: string) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), text);
}

/** The package's sources, by project-relative path, as ph migrate reads them. */
function sources(): Map<string, string> {
  const files = new Map<string, string>();
  const visit = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules") visit(path);
      } else if (/\.(?:[cm]?[jt]sx?|json|graphql)$/.test(entry.name)) {
        files.set(
          relative(dir, path).split("\\").join("/"),
          readFileSync(path, "utf8"),
        );
      }
    }
  };
  visit(dir);
  return files;
}

function apply(migration: DocumentModelMigration) {
  if (migration.kind !== "converted") {
    throw new Error(
      `not converted: ${migration.refusals.map((refusal) => refusal.reason).join("; ")}`,
    );
  }
  for (const file of migration.files) {
    if (file.after === null) {
      rmSync(join(dir, file.path));
      // ph migrate removes the directories the deletions empty.
      for (
        let parent = dirname(join(dir, file.path));
        readdirSync(parent).length === 0;
        parent = dirname(parent)
      ) {
        rmSync(parent, { recursive: true });
      }
    } else {
      write(file.path, file.after);
    }
  }
}

const migrate = (renameConflictingTypes = false, dirName = "ledger") =>
  migrateDocumentModel({
    documentModelsDir: "document-models",
    dirName,
    files: sources(),
    renameConflictingTypes,
  });

/** Asserts a refusal, whatever else the migration also refused. */
function expectRefusal(
  migration: DocumentModelMigration,
  {
    reason,
    repair,
    ...at
  }: { file?: string; line?: number; reason: string; repair?: string },
) {
  const refusals = migration.kind === "refused" ? migration.refusals : [];
  const found = refusals.find((refusal) => refusal.reason.includes(reason));
  expect(
    found,
    `no refusal contains "${reason}"; refused: ${refusals.map((refusal) => refusal.reason).join(" | ")}`,
  ).toMatchObject(at);
  expect(found?.repair ?? "").toContain(repair ?? "");
}

/** The fixture package installs no React, so it drops the generated hooks. */
function withoutHooks(version: string) {
  rmSync(join(dir, version, "hooks.ts"));
  const index = read(dir, `${version}/index.ts`);
  write(
    `${version}/index.ts`,
    index.replace('export * from "./hooks.js";\n', ""),
  );
}

/** Reducers written the ways real projects write them. */
async function implementLedger(dir: string) {
  await generateStoredModel(dir);
  for (const version of [1, 2]) {
    withoutHooks(model(version));
    write(
      `${model(version)}/src/rules.ts`,
      "export function trimmed(text: string | null | undefined): string | null {\n  return text?.trim() || null;\n}\n",
    );
    const helper = `
/** Refuses an id the ledger already holds. */
export function assertNew(entries: readonly LedgerEntry[], id: string) {
  if (entries.some((entry) => entry.id === id)) {
    throw new DuplicateEntryError(\`Entry \${id} exists\`);
  }
}
`;
    // Version 1 throws its declared error in the reducer, version 2 in a helper.
    const check =
      version === 1
        ? `if (state.entries.some((entry) => entry.id === input.id)) {
      throw new DuplicateEntryError(\`Entry \${input.id} exists\`);
    }`
        : "assertNew(state.entries, input.id);";
    write(
      `${model(version)}/src/reducers/entries.ts`,
      `import type { LedgerEntriesOperations${version === 1 ? "" : ", LedgerEntry"} } from "document-models/ledger/v${version}";
import { DuplicateEntryError } from "../../gen/entries/error.js";
import { AddEntryInputSchema } from "../../gen/schema/zod.js";
import { trimmed } from "../rules.js";
${version === 1 ? "" : helper}
export const ledgerEntriesOperations: LedgerEntriesOperations = {
  // Entries keep the order they were added in.
  addEntryOperation(state, { input }) {
    AddEntryInputSchema().parse(input);
    ${check}
    state.entries.push({ id: input.id, amount: input.amount${version > 1 ? ", note: input.note ?? null" : ""} });
  },
  setTitleOperation: (ledger, action) => {
    const _input = action.input;
    ledger.title = trimmed(_input.title);
  },
};
`,
    );
  }
  write(
    "document-models/ledger/upgrades/v2.ts",
    `import type { Action, PHDocument, UpgradeTransition } from "document-model";
import type { LedgerPHState as StateV1 } from "document-models/ledger/v1";
import type { LedgerPHState as StateV2 } from "document-models/ledger/v2";

function upgradeReducer(document: PHDocument<StateV1>, action: Action): PHDocument<StateV2> {
  const global = (state: StateV1["global"]) => ({
    ...state,
    entries: state.entries.map((entry) => ({ ...entry, note: null })),
  });
  return {
    ...document,
    state: { ...document.state, global: global(document.state.global) },
    initialState: { ...document.initialState, global: global(document.initialState.global) },
    operations: { ...document.operations },
    clipboard: [],
  } as unknown as PHDocument<StateV2>;
  void action;
}

export const v2: UpgradeTransition = { toVersion: 2, upgradeReducer, description: "Entries have a note." };
`,
  );
  write(
    `${model(2)}/src/tests/rules.test.ts`,
    'import { expect, it } from "vitest";\nimport { trimmed } from "../rules.js";\n\nit("trims", () => expect(trimmed(" a ")).toBe("a"));\n',
  );
  write(
    "editors/ledger/lazy.ts",
    'export const load = () => import("../../document-models/ledger/v2/gen/index.js");\n',
  );
  // A consumer outside the model that reached into the generated code.
  write(
    "editors/ledger/summary.ts",
    `import { addEntry, AddEntryInputSchema, type AcmeCursor, type LedgerEntry, type LedgerTag } from "../../document-models/ledger/v2/gen/index.js";
import { isLedgerDocument } from "document-models/ledger";

export const first = addEntry({ id: "e1", amount: 1 });
export const isLedger = isLedgerDocument;
export const fields = AddEntryInputSchema().shape.amount;
export const idOnly = AddEntryInputSchema().pick({ id: true });
export const tag: LedgerTag = { name: "a", children: [{ name: "b", children: [] }] };
// @ts-expect-error a recursive type keeps its field types
export const wrong: LedgerTag = { name: 1, children: [] };
export type Summary = { readonly entries: readonly LedgerEntry[]; readonly cursor: AcmeCursor | null | undefined };
`,
  );
}

type Module = {
  reducer: (
    document: unknown,
    action: unknown,
  ) => {
    state: { global: { title: string | null; entries: unknown[] } };
    operations: { global: { error?: string }[] };
  };
  actions: Record<string, (input: unknown) => unknown>;
  utils: { createDocument: () => unknown; fileExtension: string };
};

describe("migrateDocumentModel", () => {
  it.each([
    ["spread", "...{},"],
    ["extra property", "extra: 1,"],
    ["accessor", "get extra() { return 1; },"],
    ["computed property", '["extra"]: 1,'],
    ["duplicate operation", "addEntryOperation() {},"],
  ])("refuses an operations object with a %s", async (_, member) => {
    await implementLedger(dir);
    editFile(
      REDUCER,
      "ledgerEntriesOperations: LedgerEntriesOperations = {",
      `ledgerEntriesOperations: LedgerEntriesOperations = { ${member}`,
    );
    const before = sources();
    expectRefusal(await migrate(), {
      file: REDUCER,
      reason: "whose behavior cannot be preserved",
    });
    expect(sources()).toEqual(before);
  });

  it("selects the imported operations binding rather than a preceding helper object", async () => {
    await implementLedger(dir);
    const text = read(dir, REDUCER);
    const start = text.indexOf("export const ledgerEntriesOperations");
    const declaration = text.slice(start);
    write(
      REDUCER,
      text.slice(0, start) +
        declaration
          .replace("export const ledgerEntriesOperations", "const decoy")
          .replace(
            "ledger.title = trimmed(_input.title);",
            'ledger.title = "wrong";',
          ) +
        declaration,
    );
    const checkTitle = ({ reducer, actions, utils }: Module) => {
      expect(
        reducer(utils.createDocument(), actions.setTitle({ title: " Q1 " }))
          .state.global.title,
      ).toBe("Q1");
    };
    const original = await importSource(
      dir,
      "./document-models/ledger/v1/index.ts",
    );
    checkTitle(original.Ledger as Module);
    apply(await migrate());
    await regenerateDocumentModelBarrels(dir);
    typeCheck(dir);
    const migrated = await importSource(
      dir,
      "./document-models/ledger/index.ts",
    );
    checkTitle(migrated.LedgerV1 as Module);
  }, 120_000);

  it("preserves initialization from an unused named value import", async () => {
    await implementLedger(dir);
    const config = JSON.parse(read(dir, "tsconfig.json")) as {
      compilerOptions: Record<string, unknown>;
    };
    config.compilerOptions.verbatimModuleSyntax = true;
    write("tsconfig.json", JSON.stringify(config));
    write(
      "scripts/bootstrap.ts",
      'declare global { var migrationImportInit: string | undefined; } export const boot = (globalThis.migrationImportInit = "initialized");',
    );
    write(
      REDUCER,
      'import { boot } from "../../../../../scripts/bootstrap.js";\n' +
        read(dir, REDUCER).replace(
          "ledger.title = trimmed(_input.title);",
          'ledger.title = globalThis.migrationImportInit ?? "missing";',
        ),
    );
    const check = async (specifier: `./${string}`, name: string) => {
      Reflect.deleteProperty(globalThis, "migrationImportInit");
      const namespace = await importSource(dir, specifier);
      const { reducer, actions, utils } = namespace[name] as Module;
      expect(
        reducer(utils.createDocument(), actions.setTitle({ title: "ignored" }))
          .state.global.title,
      ).toBe("initialized");
    };
    try {
      await check("./document-models/ledger/v1/index.ts", "Ledger");
      apply(await migrate());
      await regenerateDocumentModelBarrels(dir);
      await check("./document-models/ledger/index.ts", "LedgerV1");
    } finally {
      Reflect.deleteProperty(globalThis, "migrationImportInit");
    }
  }, 120_000);

  it("refuses an exported reducer alias with a same-named local decoy", async () => {
    await implementLedger(dir);
    const text = read(dir, REDUCER);
    const start = text.indexOf("export const ledgerEntriesOperations");
    const declaration = text.slice(start);
    write(
      REDUCER,
      text.slice(0, start) +
        declaration
          .replace(
            "export const ledgerEntriesOperations",
            "const ledgerEntriesOperations",
          )
          .replace(
            "ledger.title = trimmed(_input.title);",
            'ledger.title = "wrong";',
          ) +
        declaration.replace(
          "export const ledgerEntriesOperations",
          "const actual",
        ) +
        "\nexport { actual as ledgerEntriesOperations };\n",
    );
    const original = await importSource(
      dir,
      "./document-models/ledger/v1/index.ts",
    );
    const { reducer, actions, utils } = original.Ledger as Module;
    expect(
      reducer(utils.createDocument(), actions.setTitle({ title: " Q1 " })).state
        .global.title,
    ).toBe("Q1");
    const before = sources();
    expectRefusal(await migrate(), {
      file: REDUCER,
      reason: "No directly exported reducer object",
      repair: "Declare the operations object directly with export const",
    });
    expect(sources()).toEqual(before);
  }, 120_000);

  it.each(["package export", "exact TypeScript path"])(
    "keeps an imported action usable when its %s only maps the old file",
    async (kind) => {
      await implementLedger(dir);
      const path = "document-models/ledger/v1/gen/creators";
      const specifier =
        kind === "package export" ? `@acme/things/${path}` : path;
      if (kind === "package export") {
        write(
          "package.json",
          JSON.stringify({
            name: "@acme/things",
            type: "module",
            exports: { [`./${path}`]: `./${path}.ts` },
          }),
        );
      } else {
        write(
          "tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              module: "nodenext",
              target: "esnext",
              strict: true,
              skipLibCheck: true,
              paths: {
                [path]: [`./${path}.ts`],
                "document-models/ledger/v1": [
                  "./document-models/ledger/v1/index.ts",
                ],
                "document-models/ledger/v2": [
                  "./document-models/ledger/v2/index.ts",
                ],
                "document-models/ledger/upgrades": [
                  "./document-models/ledger/upgrades/index.ts",
                ],
              },
            },
          }),
        );
      }
      write(
        "alias-consumer.ts",
        `import { setTitle } from ${JSON.stringify(specifier)};\nexport const action = setTitle({ title: "Q1" });\n`,
      );
      const expected = {
        action: { type: "SET_TITLE", input: { title: "Q1" } },
      };
      expect(await importSource(dir, "./alias-consumer.ts")).toMatchObject(
        expected,
      );
      apply(await migrate());
      expect(await importSource(dir, "./alias-consumer.ts")).toMatchObject(
        expected,
      );
    },
    120_000,
  );

  it("keeps sibling declarations and their exports when replacing the operations object", async () => {
    await implementLedger(dir);
    editFile(
      REDUCER,
      "export const ledgerEntriesOperations",
      'export const prefix = "[", ledgerEntriesOperations',
    );
    editFile(REDUCER, /\n};\n$/, '\n}, suffix = "]";\n');
    editFile(
      REDUCER,
      "ledger.title = trimmed(_input.title);",
      "ledger.title = prefix + trimmed(_input.title) + suffix;",
    );
    write(
      "labels.ts",
      `export { prefix, suffix } from "./${REDUCER.replace(/\.ts$/, ".js")}";\n`,
    );
    expect(await importSource(dir, "./labels.ts")).toMatchObject({
      prefix: "[",
      suffix: "]",
    });
    apply(await migrate());
    await regenerateDocumentModelBarrels(dir);
    typeCheck(dir);
    expect(await importSource(dir, "./labels.ts")).toMatchObject({
      prefix: "[",
      suffix: "]",
    });
    const namespace = await importSource(
      dir,
      "./document-models/ledger/index.ts",
    );
    const { reducer, actions, utils } = namespace.LedgerV1 as Module;
    expect(
      reducer(utils.createDocument(), actions.setTitle({ title: " Q1 " })).state
        .global.title,
    ).toBe("[Q1]");
  }, 120_000);

  it("writes the code-first scaffold's layout and keeps each reducer's behaviour and the generated names", async () => {
    await implementLedger(dir);
    const generated = await Promise.all(
      [1, 2].map(async (version) =>
        Object.keys(await importSource(dir, `./${model(version)}/index.ts`)),
      ),
    );
    apply(await migrate());
    expect(await regenerateDocumentModelBarrels(dir)).toEqual(
      expect.arrayContaining([
        "document-models/document-models.ts",
        "document-models/index.ts",
      ]),
    );
    expect(read(dir, "document-models/index.ts")).not.toContain("module.js");

    // The layout code-first scaffolding writes, plus the kept custom code.
    for (const version of [1, 2]) {
      for (const gone of [
        "gen",
        "src",
        "hooks.ts",
        "module.ts",
        "actions.ts",
      ]) {
        expect(existsSync(join(dir, model(version), gone))).toBe(false);
      }
      for (const file of [
        "definition.ts",
        "index.ts",
        "modules/entries.ts",
        "rules.ts",
        "utils.ts",
      ]) {
        expect(existsSync(join(dir, model(version), file))).toBe(true);
      }
      expect(read(dir, `${model(version)}/index.ts`)).toContain(
        `export const ledgerV${version} = ledgerModel.version({`,
      );
    }
    for (const gone of [
      "ledger.json",
      "family.ts",
      "upgrades/upgrade-manifest.ts",
      "upgrades/versions.ts",
    ]) {
      expect(existsSync(join(dir, "document-models/ledger", gone))).toBe(false);
    }
    expect(read(dir, "document-models/ledger/index.ts")).toContain(
      "export const ledgerUpgradeManifest = family.upgradeManifest;",
    );
    expect(read(dir, "document-models/ledger/upgrades/index.ts")).toContain(
      "upgrades: { v2 },",
    );
    expect(read(dir, "document-models/ledger/upgrades/v2.ts")).toContain(
      "entries.map((entry) => ({ ...entry, note: null }))",
    );

    // Version 1's reducer throws its declared error from the context; version
    // 2's helper keeps a class, so only version 2 has an errors.ts.
    expect(existsSync(join(dir, model(1), "errors.ts"))).toBe(false);
    expect(read(dir, `${model(1)}/modules/entries.ts`)).toContain(
      "{ action: { input }, errors: { DuplicateEntryError } },",
    );
    expect(existsSync(join(dir, model(2), "errors.ts"))).toBe(true);

    // The reducer body and its helper move unchanged; parameters bind from the context.
    const module = read(dir, `${model(2)}/modules/entries.ts`);
    expect(module).toContain("export function assertNew(");
    expect(module).toContain("reduce(state, _input, { action: { input } }) {");
    // The reducer declares _input itself, so the input parameter takes another name.
    expect(module).toContain("reduce(ledger, _input2, { action }) {");
    expect(module).toContain(
      'import { DuplicateEntryError } from "../errors.js";',
    );
    expect(module).toContain('import { trimmed } from "../rules.js";');
    expect(module).toContain('code: "DUPLICATE_ENTRY"');

    // A test under src/ keeps running, and a lazy import names the compat barrel.
    expect(read(dir, `${model(2)}/tests/rules.test.ts`)).toContain(
      'from "../rules.js"',
    );
    expect(read(dir, "editors/ledger/lazy.ts")).toContain(
      'import("../../document-models/ledger/compat/v2/index.js")',
    );
    // A reducer can use a schema at runtime: schema.ts reads the module's
    // inputs only when the schema is asked for.
    const entries = read(dir, `${model(1)}/modules/entries.ts`);
    expect(entries).toContain('from "../../compat/v1/schema.js"');
    expect(entries).toContain(
      'export const AddEntryInput = ph.input("AddEntryInput", {',
    );
    expect(entries).toContain("input: AddEntryInput,");
    expect(read(dir, `${model(1)}/definition.ts`)).not.toContain("ph.input(");
    expect(read(dir, "document-models/ledger/compat/v1/schema.ts")).toContain(
      'import * as ledgerEntriesInputs from "../../v1/modules/entries.js";',
    );

    // graphql-codegen named the SDL type ACMECursor AcmeCursor.
    const barrel = `${read(dir, "document-models/ledger/compat/v2/index.ts")}${read(dir, "document-models/ledger/compat/v2/schema.ts")}`;
    for (const name of [
      "export type AcmeCursor",
      "export function AcmeCursorSchema",
      "export const { addEntry, setTitle }",
      "export function isLedgerDocument",
      "export function createLedgerDocument",
      "export const ledgerDocumentType",
      "export interface LedgerEntriesOperations",
      "export const { supportedVersions, latestVersion }",
      'export * from "./custom.js";',
      'export * from "./schema.js";',
    ]) {
      expect(barrel).toContain(name);
    }

    // The consumer's imports now name the compatibility barrel.
    const summary = read(dir, "editors/ledger/summary.ts");
    expect(summary).toContain(
      'from "../../document-models/ledger/compat/v2/index.js"',
    );
    expect(summary).toContain(
      'from "../../document-models/ledger/compat/v2/schema.js"',
    );
    expect(summary).toContain(
      'from "../../document-models/ledger/compat/v2/index.js"',
    );

    typeCheck(dir);

    // compat keeps every runtime name the generated barrel exported, except
    // graphql-codegen's zod helpers, which it keeps only for a file that imports one.
    const helpers = new Set(["isDefinedNonNullAny", "definedNonNullAnySchema"]);
    for (const version of [1, 2]) {
      const compat = await importSource(
        dir,
        `./document-models/ledger/compat/v${version}/index.ts`,
      );
      expect(Object.keys(compat)).toEqual(
        expect.arrayContaining(
          generated[version - 1].filter((name) => !helpers.has(name)),
        ),
      );
      // compat's document model keeps the operation names the schema-first
      // specification stored, which code may read as action types.
      const operationNames = (model: unknown) =>
        (
          model as {
            specifications: { modules: { operations: { name: string }[] }[] }[];
          }
        ).specifications.flatMap((specification) =>
          specification.modules.flatMap((module) =>
            module.operations.map((operation) => operation.name),
          ),
        );
      expect(operationNames(compat.documentModel)).toEqual(
        expect.arrayContaining(["addEntry", "SET_TITLE"]),
      );
    }

    const namespace = await importSource(
      dir,
      "./document-models/ledger/index.ts",
    );
    expect(Object.keys(namespace).sort()).toEqual([
      "Ledger",
      "LedgerV1",
      "LedgerV2",
      "ledgerUpgradeManifest",
    ]);
    const { reducer, actions, utils } = namespace.LedgerV2 as Module;
    expect(utils.fileExtension).toBe("");
    // The model itself stores the code-first names.
    expect(
      JSON.stringify(
        (namespace.LedgerV2 as { documentModel: { global: unknown } })
          .documentModel.global,
      ),
    ).toContain('"name":"SetTitle"');
    let document = reducer(
      utils.createDocument(),
      actions.addEntry({ id: "e1", amount: 5, note: "rent" }),
    );
    document = reducer(document, actions.setTitle({ title: "  Q1  " }));
    expect(document.state.global).toMatchObject({
      title: "Q1",
      entries: [{ id: "e1", amount: 5, note: "rent" }],
    });
    document = reducer(document, actions.addEntry({ id: "e1", amount: 7 }));
    expect(document.operations.global.at(-1)?.error).toBe("Entry e1 exists");
    expect(document.state.global.entries).toHaveLength(1);

    const v1 = namespace.LedgerV1 as Module;
    const add = v1.actions.addEntry({ id: "e1", amount: 1 });
    const duplicate = v1.reducer(
      v1.reducer(v1.utils.createDocument(), add),
      add,
    );
    expect(duplicate.operations.global.at(-1)?.error).toBe("Entry e1 exists");
  }, 240_000);

  it("keeps a class that another file imports or whose errorCode would change, and moves src/ files beside the existing ones", async () => {
    await implementLedger(dir);
    // Another file catches version 2's class; version 1's generated class
    // reports its name, which the declared code does not.
    write(
      "editors/ledger/catch.ts",
      'import { DuplicateEntryError } from "../../document-models/ledger/v2/gen/entries/error.js";\nexport const isDuplicate = (error: unknown) => error instanceof DuplicateEntryError;\n',
    );
    const error = `${model(1)}/gen/entries/error.ts`;
    write(
      error,
      read(dir, error).replace(
        'errorCode = "DUPLICATE_ENTRY"',
        'errorCode = "DuplicateEntryError"',
      ),
    );
    write(`${model(2)}/rules.ts`, "export const kept = true;\n");
    apply(await migrate());
    await regenerateDocumentModelBarrels(dir);
    for (const version of [1, 2]) {
      expect(read(dir, `${model(version)}/modules/entries.ts`)).toContain(
        'import { DuplicateEntryError } from "../errors.js";',
      );
      expect(read(dir, `${model(version)}/modules/entries.ts`)).not.toContain(
        "errors: { DuplicateEntryError }",
      );
    }
    expect(read(dir, "editors/ledger/catch.ts")).toContain(
      'from "../../document-models/ledger/v2/errors.js"',
    );
    expect(read(dir, `${model(2)}/rules.ts`)).toBe(
      "export const kept = true;\n",
    );
    expect(read(dir, `${model(2)}/rules-2.ts`)).toContain(
      "export function trimmed(",
    );
    expect(read(dir, `${model(2)}/modules/entries.ts`)).toContain(
      'import { trimmed } from "../rules-2.js";',
    );
    typeCheck(dir);
  }, 240_000);

  it("refuses a model file that reads a value of the module from the compat barrel", async () => {
    await implementLedger(dir);
    const path = `${model(2)}/src/reducers/entries.ts`;
    write(
      path,
      `import { actions } from "document-models/ledger/v2";\n${read(dir, path)}\nexport const creators = actions;\n`,
    );
    expectRefusal(await migrate(), {
      file: `${model(2)}/modules/entries.ts`,
      reason: "uses actions from ../../compat/v2/index.js when it runs",
    });
  }, 120_000);

  it("refuses custom utils that replace a generated one", async () => {
    await implementLedger(dir);
    write(
      `${model(2)}/src/utils.ts`,
      'export function createDocument() {\n  throw new Error("custom");\n}\n',
    );
    expectRefusal(await migrate(), {
      file: `${model(2)}/src/utils.ts`,
      reason: "exports createDocument, which replace the generated utils",
    });
  }, 120_000);

  it.each([
    {
      shape: "a guarded statement",
      utils:
        "if (globalThis.ready === undefined) {\n  globalThis.ready = true;\n}\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a call in an initializer",
      utils:
        "export const ready = Object.assign(globalThis, { ready: true });\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a default export that calls",
      utils: "export default Object.assign(globalThis, { ready: true });\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a static field that calls",
      utils:
        "export class Setup {\n  static readonly ready = Object.assign(globalThis, {});\n}\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a bare package import",
      utils: 'import "notes-prefix-init";\n',
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "an enum member that calls",
      utils:
        "export enum Ready {\n  Yes = Object.keys(globalThis).length,\n}\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a computed method name that calls",
      utils:
        "export const handlers = {\n  [String(Object.assign(globalThis, { ready: true }))]() {},\n};\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a setup module outside the model",
      utils: 'import "../../../../lib/setup.js";\n',
      at: "../../../lib/setup.ts",
      line: 1,
    },
    {
      shape: "a setup module a path alias names",
      utils:
        'import { ready } from "scalars/setup.js";\n\nexport const isReady = () => ready;\n',
      at: "../../../scalars/setup.ts",
      line: 2,
    },
    {
      shape: "a setup module in a shared folder of the model",
      utils:
        'import { ready } from "../../shared/setup.js";\n\nexport const isReady = () => ready;\n',
      at: "../shared/setup.ts",
      line: 2,
    },
    {
      shape: "a custom setup file in the version root",
      utils:
        'import { ready } from "../setup.js";\n\nexport const isReady = () => ready;\n',
      at: "setup.ts",
      line: 2,
    },
    {
      shape: "a custom setup file in the model root",
      utils:
        'import { ready } from "../../setup.js";\n\nexport const isReady = () => ready;\n',
      at: "../setup.ts",
      line: 2,
    },
    {
      shape: "a custom helper in the upgrades folder",
      utils:
        'import { ready } from "../../upgrades/setup.js";\n\nexport const isReady = () => ready;\n',
      at: "../upgrades/setup.ts",
      line: 2,
    },
    {
      shape: "an empty import of a package",
      utils: 'import {} from "notes-prefix-init";\n',
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a re-export of a whole package",
      utils: 'export * from "notes-prefix-init";\n',
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a computed key in a destructuring pattern",
      utils:
        "export const { [String(Object.assign(globalThis, {}))]: picked } = {} as Record<string, string>;\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a constructor argument that runs code when iterated",
      utils:
        'const seed = {\n  *[Symbol.iterator]() {\n    yield ["a", String(Object.assign(globalThis, {}))] as const;\n  },\n};\nexport const cache = new Map(seed);\n',
      at: "src/utils.ts",
      line: 6,
    },
    {
      shape: "a local class named like a built-in",
      utils:
        "class Map {\n  constructor() {\n    Object.assign(globalThis, { ready: true });\n  }\n}\nexport const cache = new Map();\n",
      at: "src/utils.ts",
      line: 6,
    },
    {
      shape: "a destructuring default that calls",
      utils:
        "export const { ready = Object.assign(globalThis, {}) } = {} as {\n  ready?: object;\n};\n",
      at: "src/utils.ts",
      line: 1,
    },
    {
      shape: "a computed class member name that calls",
      utils:
        "export class Setup {\n  [String(Object.assign(globalThis, {}))]() {}\n}\n",
      at: "src/utils.ts",
      line: 1,
    },
  ])(
    "refuses load-time code through $shape",
    async ({ utils, at, line }) => {
      await implementLedger(dir);
      write(`${model(2)}/src/utils.ts`, utils);
      write("lib/setup.ts", "globalThis.ready = true;\n");
      const setup = "export const ready = true;\nglobalThis.ready = ready;\n";
      write("scalars/setup.ts", setup);
      write("document-models/ledger/shared/setup.ts", setup);
      write(`${model(2)}/setup.ts`, setup);
      write("document-models/ledger/setup.ts", setup);
      write("document-models/ledger/upgrades/setup.ts", setup);
      const file = posix.normalize(`${model(2)}/${at}`);
      expectRefusal(await migrate(), {
        file,
        line,
        reason: `${file} runs code when it loads`,
      });
    },
    120_000,
  );

  it("refuses load-time code a reducer imports only as a type", async () => {
    await implementLedger(dir);
    write(
      `${model(2)}/src/setup.ts`,
      "export type Marker = number;\nglobalThis.ready = true;\n",
    );
    write(`${model(2)}/src/utils.ts`, 'import "./setup.js";\n');
    // A compiler drops this import, so the reducer does not load setup.ts.
    const reducer = `${model(2)}/src/reducers/entries.ts`;
    write(
      reducer,
      `import { Marker } from "../setup.js";\nexport type Seen = Marker;\n${read(dir, reducer)}`,
    );
    expectRefusal(await migrate(), {
      file: `${model(2)}/src/setup.ts`,
      line: 2,
      reason: `${model(2)}/src/setup.ts runs code when it loads`,
    });
  }, 120_000);

  it("converts custom utils that only declare", async () => {
    await implementLedger(dir);
    write(
      `${model(2)}/src/utils.ts`,
      'export class Setup {\n  static readonly ready = 1;\n}\n\nexport const cache = new Map<string, number>([["a", 1]]);\nexport const seen = new Set(["a"]);\n\nexport const label = (title: string) => `${title}!`;\n',
    );
    apply(await migrate());
    const utils = read(dir, `${model(2)}/utils.ts`);
    expect(utils).toContain("static readonly ready = 1;");
    expect(utils).toContain('new Map<string, number>([["a", 1]])');
    expect(utils).toContain('new Set(["a"])');
  }, 120_000);

  it("refuses custom code the model would stop running when it loads", async () => {
    await implementLedger(dir);
    write(
      `${model(2)}/src/utils.ts`,
      'import { marks } from "./marks.js";\n\nexport const describeEntry = () => marks.length;\n',
    );
    write(
      `${model(2)}/src/marks.ts`,
      'export const marks: string[] = [];\nmarks.push("loaded");\n',
    );
    expectRefusal(await migrate(), {
      file: `${model(2)}/src/marks.ts`,
      line: 2,
      reason: `${model(2)}/src/marks.ts runs code when it loads`,
    });

    // A reducer loads it too, so it still runs when the model loads.
    const reducer = `${model(2)}/src/reducers/entries.ts`;
    write(reducer, `import "../marks.js";\n${read(dir, reducer)}`);
    apply(await migrate());
    expect(read(dir, `${model(2)}/marks.ts`)).toContain(
      'marks.push("loaded");',
    );
  }, 120_000);

  it("moves JavaScript custom code a reducer loads, with a call inside a class", async () => {
    await implementLedger(dir);
    const marks =
      'export class Marks {\n  add(mark) {\n    console.log("marking");\n    return mark;\n  }\n}\n\nglobalThis.marks = new Marks();\n';
    write(`${model(2)}/src/marks.mjs`, marks);
    write(`${model(2)}/src/utils.ts`, 'import "./marks.mjs";\n');
    const reducer = `${model(2)}/src/reducers/entries.ts`;
    write(reducer, `import "../marks.mjs";\n${read(dir, reducer)}`);
    apply(await migrate());
    expect(read(dir, `${model(2)}/marks.mjs`)).toBe(marks);
  }, 120_000);

  it("converts custom utils that load setup code an upgrade transition loads too", async () => {
    await implementLedger(dir);
    write(
      "document-models/ledger/upgrades/setup.ts",
      "export const ready = true;\nglobalThis.ready = ready;\n",
    );
    write(
      `${model(2)}/src/utils.ts`,
      'import { ready } from "../../upgrades/setup.js";\n\nexport const isReady = () => ready;\n',
    );
    const transition = "document-models/ledger/upgrades/v2.ts";
    write(transition, `import "./setup.js";\n${read(dir, transition)}`);
    apply(await migrate());
    expect(read(dir, `${model(2)}/utils.ts`)).toContain("isReady");
  }, 120_000);

  it("refuses a reducer that calls another through this", async () => {
    await implementLedger(dir);
    const path = `${model(2)}/src/reducers/entries.ts`;
    write(
      path,
      read(dir, path).replace(
        "assertNew(state.entries, input.id);",
        "assertNew(state.entries, input.id);\n    this.setTitleOperation(state, { input: { title: null } } as never);",
      ),
    );
    expectRefusal(await migrate(), { file: path, reason: "uses this" });
  }, 120_000);

  it("refuses a type named like a catalog scalar unless asked to rename it", async () => {
    const renamed = JSON.parse(
      JSON.stringify(ledgerModel).replaceAll("LedgerEntry", "Address"),
    ) as typeof ledgerModel;
    await generateStoredModel(dir, renamed);
    expectRefusal(await migrate(), {
      reason:
        "declares a type named Address, which is also a Powerhouse catalog scalar",
      repair: "--rename-conflicting-types",
    });

    const migration = await migrate(true);
    expect(
      migration.kind === "converted" ? migration.renamedTypes : migration,
    ).toEqual([
      { version: 1, from: "Address", to: "LedgerAddress" },
      { version: 2, from: "Address", to: "LedgerAddress" },
    ]);
    apply(migration);
    const definition = read(dir, `${model(2)}/definition.ts`);
    expect(definition).toContain('ph.object("LedgerAddress"');
    expect(definition).not.toContain('"Address"');
    expect(read(dir, "document-models/ledger/compat/v2/schema.ts")).toContain(
      "export type Address = Mutable<SourceOf<typeof declared.LedgerAddress>>;",
    );
  }, 120_000);

  it("rewrites imports that name the model through the package's own name", async () => {
    await implementLedger(dir);
    const tsconfig = JSON.parse(read(dir, "tsconfig.json")) as {
      compilerOptions: { paths: Record<string, string[]> };
    };
    tsconfig.compilerOptions.paths["@acme/things/document-models/*"] = [
      "./document-models/*/index.ts",
    ];
    writeFileSync(join(dir, "tsconfig.json"), JSON.stringify(tsconfig));
    write(
      "editors/ledger/self.ts",
      'import { isLedgerDocument } from "@acme/things/document-models/ledger";\nimport type { LedgerPHState } from "@acme/things/document-models/ledger/v2";\n\nexport const isLedger = isLedgerDocument;\nexport type State = LedgerPHState;\n',
    );
    apply(await migrate());
    await regenerateDocumentModelBarrels(dir);
    const self = read(dir, "editors/ledger/self.ts");
    expect(self).toContain(
      'import { isLedgerDocument } from "../../document-models/ledger/compat/v2/index.js";',
    );
    expect(self).toContain(
      'import type { LedgerPHState } from "../../document-models/ledger/compat/v2/index.js";',
    );
    typeCheck(dir);
  }, 240_000);

  it("rewrites JavaScript consumers and refuses to replace a file the project wrote", async () => {
    await implementLedger(dir);
    write(
      "scripts/consumer.mjs",
      'export { addEntry } from "../document-models/ledger/v2/gen/index.js";\n',
    );
    write(
      "scripts/slash.ts",
      'export { addEntry } from "../document-models/ledger/v2/gen/";\n',
    );
    // An import() passed on to another call is still an import to rewrite.
    write(
      "scripts/lazy.ts",
      'export const load = () =>\n  Promise.resolve(import("../document-models/ledger/v2/gen/index.js"));\n',
    );
    write(
      "scripts/types.ts",
      'export type Entry = import("../document-models/ledger/v2/gen/index.js").LedgerEntry;\n',
    );
    // A path written only with escapes is still a path, even in a file with
    // no plain relative path or alias.
    write(
      "scripts/escaped.ts",
      'export const load = () =>\n  import("\\u002e\\u002e\\u002fdocument\\u002dmodels/ledger/v2/gen/index.js");\n',
    );
    write(`${model(2)}/src/label.mjs`, 'export const label = "entry";\n');
    // An explicit .mjs names that file, not a .ts file of the same name.
    write(`${model(2)}/src/label.ts`, 'export const label = "ts";\n');
    // A query is no path, so moving its importer keeps it as written.
    write(
      `${model(2)}/src/consumer.mjs`,
      'export { label } from "./label.mjs?path=/../../gone";\n',
    );
    // A moved file's string naming a sibling that moves with it stays valid.
    write(
      `${model(2)}/src/tests/fixture.ts`,
      'export const fixture = "../label.mjs";\n',
    );
    // An explicit .mjs names that file, even beside its .mts source whose
    // move takes another name.
    write(`${model(2)}/src/helper.mjs`, "export const answer = 42;\n");
    write(`${model(2)}/src/helper.mts`, "export const answer = 17;\n");
    write(`${model(2)}/helper.mts`, "export const answer = 99;\n");
    write(
      "scripts/helper.mjs",
      `export { answer } from "../${model(2)}/src/helper.mjs";\n`,
    );
    // require reads a percent sign as part of the file name.
    write(`${model(2)}/src/odd%20name.cjs`, "module.exports = 1;\n");
    write(
      "scripts/odd.mjs",
      `import { createRequire } from "node:module";\nexport const odd = createRequire(import.meta.url)("../${model(2)}/src/odd%20name.cjs");\n`,
    );
    // ".." names the directory's index like "../".
    write(
      `${model(2)}/tests/bare-dots.ts`,
      'export const load = () => import("..");\n',
    );
    // Percent-encoding the loader decodes is refused rather than rewritten.
    write(
      "scripts/percent.mjs",
      `export { label } from "../${model(2)}/src/%6cabel.mjs";\n`,
    );
    // .mjs names the .mts it compiles from.
    write(`${model(2)}/src/answer.mts`, "export const answer = 42;\n");
    write(
      "scripts/answer.mts",
      `export { answer } from "../${model(2)}/src/answer.mjs";\n`,
    );
    // A string of only dots and slashes names no module.
    write(
      `${model(2)}/src/paths.ts`,
      'export const isLocal = (path: string) => path.startsWith("./");\n',
    );
    write(
      "scripts/label.mjs",
      `export { label } from "../${model(2)}/src/label.mjs";\nexport { label as fresh } from "../${model(2)}/src/label.mjs?fresh=1";\n`,
    );
    // A query on a file the migration replaces would apply to other code.
    write(
      "scripts/query.ts",
      'export const load = () =>\n  import("../document-models/ledger/v2/gen/index.js?fresh=1");\n',
    );
    // A call inside a class body of a JavaScript file, outside the model and
    // in its src/, which the migration moves.
    const tool = (from: string) =>
      `import { addEntry } from "${from}";\n\nexport class Tool {\n  add() {\n    console.log("adding");\n    return addEntry({ id: "e1", amount: 1 });\n  }\n}\n`;
    write(
      "scripts/tool.mjs",
      tool("../document-models/ledger/v2/gen/index.js"),
    );
    const labeller =
      'import { label } from "./label.mjs";\n\nexport class Labeller {\n  print() {\n    console.log("printing");\n    return label;\n  }\n}\n';
    write(`${model(2)}/src/labeller.mjs`, labeller);
    write(`${model(2)}/definition.ts`, "export const kept = true;\n");
    expectRefusal(await migrate(), {
      file: `${model(2)}/definition.ts`,
      reason: `${model(2)}/definition.ts exists`,
    });

    rmSync(join(dir, `${model(2)}/definition.ts`));
    expectRefusal(await migrate(), {
      file: "scripts/query.ts",
      line: 2,
      reason:
        "scripts/query.ts imports ../document-models/ledger/v2/gen/index.js?fresh=1, which the migration replaces. Its query or fragment",
    });
    rmSync(join(dir, "scripts/query.ts"));
    expectRefusal(await migrate(), {
      file: "scripts/percent.mjs",
      line: 1,
      reason: `scripts/percent.mjs imports ../${model(2)}/src/%6cabel.mjs, which the migration moves or replaces, through a percent-encoded path`,
    });
    rmSync(join(dir, "scripts/percent.mjs"));
    expectRefusal(await migrate(), {
      file: "scripts/odd.mjs",
      reason: `scripts/odd.mjs names ../${model(2)}/src/odd%20name.cjs`,
    });
    rmSync(join(dir, "scripts/odd.mjs"));
    apply(await migrate());
    expect(read(dir, "scripts/consumer.mjs")).toBe(
      'export { addEntry } from "../document-models/ledger/compat/v2/index.js";\n',
    );
    expect(read(dir, "scripts/tool.mjs")).toBe(
      tool("../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, `${model(2)}/labeller.mjs`)).toBe(labeller);
    // Written without an extension, so rewritten without one.
    expect(read(dir, "scripts/slash.ts")).toBe(
      'export { addEntry } from "../document-models/ledger/compat/v2/index";\n',
    );
    expect(read(dir, "scripts/lazy.ts")).toBe(
      'export const load = () =>\n  Promise.resolve(import("../document-models/ledger/compat/v2/index.js"));\n',
    );
    expect(read(dir, "scripts/types.ts")).toContain(
      'import("../document-models/ledger/compat/v2/schema.js").LedgerEntry',
    );
    expect(read(dir, `${model(2)}/label.mjs`)).toBe(
      'export const label = "entry";\n',
    );
    expect(read(dir, "scripts/label.mjs")).toBe(
      `export { label } from "../${model(2)}/label.mjs";\nexport { label as fresh } from "../${model(2)}/label.mjs?fresh=1";\n`,
    );
    expect(read(dir, `${model(2)}/consumer.mjs`)).toBe(
      'export { label } from "./label.mjs?path=/../../gone";\n',
    );
    expect(read(dir, `${model(2)}/tests/fixture.ts`)).toBe(
      'export const fixture = "../label.mjs";\n',
    );
    expect(read(dir, `${model(2)}/tests/bare-dots.ts`)).toBe(
      'export const load = () => import("../../compat/v2/index");\n',
    );
    expect(read(dir, "scripts/helper.mjs")).toBe(
      `export { answer } from "../${model(2)}/helper.mjs";\n`,
    );
    expect(read(dir, "scripts/answer.mts")).toBe(
      `export { answer } from "../${model(2)}/answer.mjs";\n`,
    );
    expect(read(dir, `${model(2)}/paths.ts`)).toBe(
      'export const isLocal = (path: string) => path.startsWith("./");\n',
    );
    expect(read(dir, "scripts/escaped.ts")).toBe(
      'export const load = () =>\n  import("../document-models/ledger/compat/v2/index.js");\n',
    );
  }, 240_000);

  it("points a mock of the model at the file that now provides the names it replaces", async () => {
    await implementLedger(dir);
    const spread = (target: string) =>
      `import { vi } from "vitest";\n\nvi.mock("${target}", async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => null,\n}));\n`;
    const actual = (target: string) =>
      `import { jest } from "@jest/globals";\n\njest.mock("${target}", () => {\n  const helper = () => {\n    return 1;\n  };\n  return { ...jest.requireActual("${target}"), addEntry: helper };\n});\n`;
    const stored = (target: string) =>
      `import { vi } from "vitest";\n\nvi.mock("${target}", async (importOriginal) => {\n  const mod = await importOriginal<typeof import("${target}")>();\n  const addEntry = vi.fn(() => null);\n  return { ...mod, addEntry };\n});\n`;
    const esModule = (target: string) =>
      `import { jest } from "@jest/globals";\n\njest.mock("${target}", () => ({\n  __esModule: true,\n  ...jest.requireActual("${target}"),\n  addEntry: () => null,\n}));\n`;
    write("editors/ledger/spread.test.ts", spread("document-models/ledger"));
    write("editors/ledger/actual.test.ts", actual("document-models/ledger"));
    write("editors/ledger/stored.test.ts", stored("document-models/ledger"));
    write(
      "editors/ledger/es-module.test.ts",
      esModule("document-models/ledger"),
    );
    // Two mocks of one module collapse to the last before and after.
    const twice = (target: string) =>
      `${spread(target)}\nvi.doMock("${target}", async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => 1,\n}));\n`;
    write("editors/ledger/twice.test.ts", twice("document-models/ledger"));
    const typed = (target: string) =>
      `import { vi } from "vitest";\n\nvi.mock(import("${target}"), async (original) => ({\n  ...(await original()),\n  addEntry: () => null,\n}));\n`;
    write("editors/ledger/typed.test.ts", typed("document-models/ledger"));
    const template = (target: string) =>
      `import { vi } from "vitest";\n\nvi.mock(\`${target}\`, async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => null,\n}));\n`;
    write(
      "editors/ledger/template.test.ts",
      template("document-models/ledger"),
    );
    // vitest exports its utilities as `vitest` as well as `vi`.
    const vitestActual = (target: string) =>
      `import { vitest } from "vitest";\n\nvitest.mock("${target}", async () => ({\n  ...(await vitest.importActual("${target}")),\n  addEntry: () => null,\n}));\n`;
    write(
      "editors/ledger/vitest-actual.test.ts",
      vitestActual("document-models/ledger"),
    );
    const aliased = (target: string) =>
      `import { vi as v } from "vitest";\n\nv.mock("${target}", async () => ({\n  ...(await v.importActual("${target}")),\n  addEntry: () => null,\n}));\n`;
    write("editors/ledger/aliased.test.ts", aliased("document-models/ledger"));
    // The same mock in a JavaScript test.
    write("editors/ledger/aliased.test.mjs", aliased("document-models/ledger"));
    const refused = {
      "editors/ledger/family.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => null,\n  Ledger: {},\n}));\n',
      "editors/ledger/whole.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", () => ({ addEntry: () => null }));\n',
      "editors/ledger/second-spread.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => {\n  const overrides = { Ledger: {} };\n  return { ...(await original<object>()), ...overrides, addEntry: () => null };\n});\n',
      "editors/ledger/reassigned.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => {\n  let mod = await original<object>();\n  mod = {};\n  return { ...mod, addEntry: () => null };\n});\n',
      "editors/ledger/unawaited.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", (original) => ({\n  ...original(),\n  addEntry: () => null,\n}));\n',
      "editors/ledger/late-spread.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => ({\n  addEntry: () => null,\n  ...(await original<object>()),\n}));\n',
      "editors/ledger/read-elsewhere.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => {\n  const mod = await original<{ addEntry: () => null }>();\n  return { ...mod, addEntry: vi.fn(mod.addEntry) };\n});\n',
      "editors/ledger/arguments.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => ({\n  ...(await original("other")),\n  addEntry: () => null,\n}));\n',
      "editors/ledger/rebound.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => {\n  const reset = (original = async () => ({}));\n  return { ...(await original()), addEntry: reset };\n});\n',
      "editors/ledger/runs.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async (original) => {\n  const value = compute();\n  return { ...(await original<object>()), addEntry: value };\n});\n',
      "editors/ledger/shadowed.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async () => {\n  const vi = { importActual: async (_specifier: string) => ({}) };\n  return {\n    ...(await vi.importActual("document-models/ledger")),\n    addEntry: () => null,\n  };\n});\n',
      "editors/ledger/typed-whole.test.ts":
        'import { vi } from "vitest";\n\nvi.mock(import("document-models/ledger"), () => ({\n  addEntry: () => null,\n}));\n',
      // Without a loader parameter, no zero-argument call is the original.
      "editors/ledger/no-loader.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async () => ({\n  ...(await (async () => ({}))()),\n  addEntry: () => null,\n}));\n',
      "editors/ledger/foreign.test.ts":
        'import { vi } from "vitest";\n\nvi.mock("document-models/ledger", async () => ({\n  ...(await vi.importActual("./fake.js")),\n  addEntry: () => null,\n}));\n',
    };
    // Each mock is safe alone, but they would all move to compat/v2, and a
    // test shares its setup files' mocks.
    const colliding = "editors/ledger/colliding.test.ts";
    write(
      colliding,
      'import { vi } from "vitest";\n\nvi.mock("../../document-models/ledger/v2/gen/creators.js", async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => null,\n}));\n',
    );
    const setup = "editors/ledger/setup.ts";
    write(
      setup,
      'import { vi } from "vitest";\n\nvi.mock("../../document-models/ledger/v2/gen/index.js", async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => null,\n}));\n',
    );
    // An unmock clears the mock of the file it names, which is now compat/v2.
    const unmock = "editors/ledger/unmock.test.ts";
    write(
      unmock,
      'import { vi } from "vitest";\n\nvi.unmock("../../document-models/ledger/v2/gen/creators.js");\n',
    );
    const typedUnmock = "editors/ledger/typed-unmock.test.ts";
    write(
      typedUnmock,
      'import { vi } from "vitest";\n\nvi.unmock(import("../../document-models/ledger/v2/gen/creators.js"));\n',
    );
    const vitestUnmock = "editors/ledger/vitest-unmock.test.ts";
    write(
      vitestUnmock,
      'import { vitest } from "vitest";\n\nvitest.unmock(import("../../document-models/ledger/v2/gen/creators.js"));\n',
    );
    // A string naming a removed file that the migration does not follow as a
    // module name is refused, wherever it is.
    const namespace = "editors/ledger/namespace.test.ts";
    write(
      namespace,
      'import * as testApi from "vitest";\n\ntestApi.vi.doMock("../../document-models/ledger/v2/gen/creators.js", async (original) => ({\n  ...(await original<object>()),\n  addEntry: () => null,\n}));\n',
    );
    const localAlias = "editors/ledger/local-alias.test.ts";
    write(
      localAlias,
      'import { vi } from "vitest";\n\nconst v = vi;\nv.doMock("../../document-models/ledger/v2/gen/creators.js", () => ({\n  addEntry: () => null,\n}));\n',
    );
    const held = "editors/ledger/held.test.ts";
    write(
      held,
      'import { vi } from "vitest";\n\nconst target = "../../document-models/ledger/v2/gen/creators.js";\nvi.doMock(target, () => ({ addEntry: () => null }));\n',
    );
    // A file the migration moves out of src/ keeps its strings' meaning.
    const movedHeld = `${model(2)}/src/tests/held.test.ts`;
    write(
      movedHeld,
      'import { vi } from "vitest";\n\nconst target = "../../gen/creators.js";\nvi.doMock(target, () => ({ addEntry: () => null }));\n',
    );
    // ... including one that names a file the migration keeps.
    const movedKept = `${model(2)}/src/tests/kept.test.ts`;
    write(
      movedKept,
      'import { vi } from "vitest";\n\nconst target = "../../../../../editors/ledger/spread.test.js";\nvi.doMock(target, () => ({}));\n',
    );
    // "./" held for import() names the model index, unlike `p.startsWith("./")`.
    const heldDir = "document-models/ledger/held-dir.test.ts";
    write(
      heldDir,
      'const path = "./";\nexport const load = () => import(path);\n',
    );
    // An unrecognized call may load "./"; only string methods read it as text.
    const dotsCall = "document-models/ledger/dots-call.test.ts";
    write(
      dotsCall,
      'import { vi } from "vitest";\n\nexport const model = await vi.importActual.call(vi, "./");\n',
    );
    const later = "editors/ledger/later.test.ts";
    write(
      later,
      'import { vi } from "vitest";\n\nvi.doMock.call(vi, "../../document-models/ledger/v2/gen/creators.js", () => ({\n  addEntry: () => null,\n}));\n',
    );
    // vi.mock(await import("…")) names its module like vi.mock(import("…")).
    const awaited = "editors/ledger/awaited.test.ts";
    write(
      awaited,
      'import { vi } from "vitest";\n\nvi.mock(await import("../../document-models/ledger/v2/gen/creators.js"), () => ({\n  addEntry: () => null,\n}));\n',
    );
    const aliasedWhole = "editors/ledger/aliased-whole.test.ts";
    write(
      aliasedWhole,
      'import { vi as v } from "vitest";\n\nv.mock("../../document-models/ledger/v2/gen/creators.js", () => ({\n  addEntry: () => null,\n}));\n',
    );
    const vitestWhole = "editors/ledger/vitest-whole.test.ts";
    write(
      vitestWhole,
      'import { vitest } from "vitest";\n\nvitest.mock("../../document-models/ledger/v2/gen/creators.js", () => ({\n  addEntry: () => null,\n}));\n',
    );
    // Spacing and comments in the callee do not hide the mock.
    const spaced = "editors/ledger/spaced.test.ts";
    write(
      spaced,
      'import { vi } from "vitest";\n\nvi /* mock */ . mock(import("../../document-models/ledger/v2/gen/creators.js"), () => ({\n  addEntry: () => null,\n}));\n',
    );
    // Parentheses and casts around the typed form do not hide the mock.
    const wrapped = "editors/ledger/wrapped.test.ts";
    write(
      wrapped,
      'import { vi } from "vitest";\n\nvi.mock((import("../../document-models/ledger/v2/gen/creators.js")!) as never, () => ({\n  addEntry: () => null,\n}));\n',
    );
    // One generated file's names now share compat/v2 with the others'.
    const generated = "editors/ledger/creators.test.ts";
    write(
      generated,
      'import { vi } from "vitest";\n\nvi.mock("../../document-models/ledger/v2/gen/creators.js", function () {\n  return { addEntry: () => null };\n});\n',
    );
    for (const [path, text] of Object.entries(refused)) write(path, text);
    const migration = await migrate();
    for (const file of Object.keys(refused)) {
      expectRefusal(migration, {
        file,
        line: 3,
        reason: `${file} mocks document-models/ledger, which the migration replaces`,
        repair: "Write the factory as async (importOriginal) =>",
      });
    }

    for (const [file, verb, module] of [
      [colliding, "mocks", "../../document-models/ledger/v2/gen/creators.js"],
      [setup, "mocks", "../../document-models/ledger/v2/gen/index.js"],
      [unmock, "unmocks", "../../document-models/ledger/v2/gen/creators.js"],
      [
        typedUnmock,
        "unmocks",
        "../../document-models/ledger/v2/gen/creators.js",
      ],
      [
        vitestUnmock,
        "unmocks",
        "../../document-models/ledger/v2/gen/creators.js",
      ],
      ["editors/ledger/spread.test.ts", "mocks", "document-models/ledger"],
    ] as const) {
      expectRefusal(migration, {
        file,
        line: 3,
        reason: `${file} ${verb} ${module}, and another mock or unmock in the package names a different module whose names move to the same file`,
        repair: "Mock or unmock the model's index.ts instead",
      });
    }
    for (const [file, line] of [
      [namespace, 3],
      [localAlias, 4],
      [held, 3],
      [later, 3],
    ] as const) {
      expectRefusal(migration, {
        file,
        line,
        reason: `${file} names ../../document-models/ledger/v2/gen/creators.js in a string the migration does not follow as a module name`,
        repair: "Name the module directly",
      });
    }
    expectRefusal(migration, {
      file: movedHeld,
      line: 3,
      reason: `${movedHeld} names ../../gen/creators.js in a string the migration does not follow as a module name`,
      repair: "Name the module directly",
    });
    expectRefusal(migration, {
      file: dotsCall,
      line: 3,
      reason: `${dotsCall} names ./ in a string the migration does not follow as a module name`,
    });
    expectRefusal(migration, {
      file: heldDir,
      line: 1,
      reason: `${heldDir} names ./ in a string the migration does not follow as a module name`,
    });
    expectRefusal(migration, {
      file: movedKept,
      line: 3,
      reason: `${movedKept} names ../../../../../editors/ledger/spread.test.js in a string the migration does not follow as a module name`,
    });
    for (const file of [wrapped, spaced, vitestWhole, aliasedWhole, awaited]) {
      expectRefusal(migration, {
        file,
        line: 3,
        reason: `${file} mocks ../../document-models/ledger/v2/gen/creators.js, which the migration replaces`,
      });
    }
    expectRefusal(migration, {
      file: generated,
      line: 3,
      reason: `${generated} mocks ../../document-models/ledger/v2/gen/creators.js`,
    });

    for (const path of [
      ...Object.keys(refused),
      generated,
      colliding,
      setup,
      unmock,
      typedUnmock,
      vitestUnmock,
      vitestWhole,
      aliasedWhole,
      namespace,
      localAlias,
      held,
      later,
      movedHeld,
      movedKept,
      heldDir,
      dotsCall,
      awaited,
      spaced,
      wrapped,
    ]) {
      rmSync(join(dir, path));
    }
    apply(await migrate());
    expect(read(dir, "editors/ledger/spread.test.ts")).toBe(
      spread("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/actual.test.ts")).toBe(
      actual("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/stored.test.ts")).toBe(
      stored("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/es-module.test.ts")).toBe(
      esModule("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/twice.test.ts")).toBe(
      twice("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/typed.test.ts")).toBe(
      typed("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/template.test.ts")).toBe(
      template("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/vitest-actual.test.ts")).toBe(
      vitestActual("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/aliased.test.ts")).toBe(
      aliased("../../document-models/ledger/compat/v2/index.js"),
    );
    expect(read(dir, "editors/ledger/aliased.test.mjs")).toBe(
      aliased("../../document-models/ledger/compat/v2/index.js"),
    );
  }, 240_000);

  it("refuses a CommonJS consumer of a generated file it replaces", async () => {
    await implementLedger(dir);
    write(
      "scripts/consumer.cts",
      'module.exports = require("../document-models/ledger/v2/gen/index.js");\n',
    );
    write(
      "scripts/equals.cts",
      'import ledger = require("../document-models/ledger/v2/gen/index.js");\nexport = ledger;\n',
    );
    const migration = await migrate();
    for (const file of ["scripts/consumer.cts", "scripts/equals.cts"]) {
      expectRefusal(migration, {
        file,
        line: 1,
        reason: `${file} loads ../document-models/ledger/v2/gen/index.js with require. The migration removes that file`,
      });
    }
  }, 120_000);

  it("refuses an import of the stored specification it removes", async () => {
    await implementLedger(dir);
    write(
      "scripts/spec.ts",
      'import spec from "../document-models/ledger/ledger.json" with { type: "json" };\nexport const id: string = spec.id;\n',
    );
    expectRefusal(await migrate(), {
      file: "scripts/spec.ts",
      line: 1,
      reason:
        "imports default from ../document-models/ledger/ledger.json, which the migration removes",
    });
  }, 120_000);

  it("refuses an import of a generated name nothing provides any more", async () => {
    await implementLedger(dir);
    write(
      "editors/ledger/errors.ts",
      'import { errors } from "../../document-models/ledger/v2/gen/entries/error.js";\nexport const all = errors;\n',
    );
    expectRefusal(await migrate(), {
      file: "editors/ledger/errors.ts",
      line: 1,
      reason:
        "imports errors from ../../document-models/ledger/v2/gen/entries/error.js",
    });
  }, 120_000);

  it("converts a local scope, enums, interfaces, input defaults, deprecations and a union in a cycle", async () => {
    await generateStoredModel(dir, boardModel);
    const version = "document-models/board/v1";
    withoutHooks(version);
    write(
      `${version}/src/reducers/board.ts`,
      `import type { BoardBoardOperations } from "document-models/board/v1";

// Has the name of a definition type a moved input names.
const BoardStatus = { open: "OPEN" } as const;

export const boardBoardOperations: BoardBoardOperations = {
  renameOperation(state, action) {
    state.name = action.input.name ?? "untitled";
    state.status = action.input.status ?? BoardStatus.open;
  },
  addItemOperation(state, action) {
    state.items.push({ name: action.input.name, weight: action.input.weight ?? null });
  },
};
`,
    );
    write(
      `${version}/src/reducers/view.ts`,
      `import type { BoardViewOperations } from "document-models/board/v1";
import type { ToggleInput } from "../../gen/schema/types.js";

const collapsed = (input: ToggleInput) => input.collapsed;

export const boardViewOperations: BoardViewOperations = {
  toggleOperation(state, action) {
    state.collapsed = collapsed(action.input);
  },
};
`,
    );
    const generated = Object.keys(
      await importSource(dir, `./${version}/index.ts`),
    );
    const migration = await migrate(false, "board");
    expect(migration.kind === "converted" && migration.notes).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          "Version 1: RenameInput.name has a default, so a code-first caller may omit it",
        ),
      ]),
    );
    apply(migration);
    await regenerateDocumentModelBarrels(dir);

    const definition = read(dir, `${version}/definition.ts`);
    for (const text of [
      'ph.enum("BoardStatus"',
      'ph.interface("BoardNamed"',
      'deprecated: "Use name"',
      'deprecated: "Archive instead"',
      '"BoardAudit"',
      '"BoardLocalState"',
    ]) {
      expect(definition).toContain(text);
    }
    // A module declares the inputs only its operations use; the enum they
    // name stays in the definition.
    expect(definition).not.toContain('ph.input("RenameInput"');
    const board = read(dir, `${version}/modules/board.ts`);
    expect(board).toContain(
      'export const RenameInput = ph.input("RenameInput", {',
    );
    expect(board).toContain('defaultValue: "untitled"');
    expect(board).toContain("input: RenameInput,");
    expect(board).toContain(
      'status: ph.ref(BoardStatus2, { defaultValue: "OPEN" })',
    );
    // An input two modules use, or whose name the reducer code uses, stays.
    for (const name of ["BoardTagInput", "ToggleInput"]) {
      expect(definition).toContain(`export const ${name} = ph.input(`);
    }
    expect(board).toContain("tag: ph.ref(BoardTagInput)");
    // The module imports what it names from the definition, under another
    // name when its reducer code already uses one.
    expect(board).toContain(
      'import {\n  boardModel,\n  BoardStatus as BoardStatus2,\n  BoardTagInput,\n} from "../definition.js";',
    );
    const view = read(dir, `${version}/modules/view.ts`);
    // The reducer code imports the ToggleInput type from compat.
    expect(view).toContain(
      'import { boardModel, ToggleInput as ToggleInput2 } from "../definition.js";',
    );
    expect(view).toContain("input: ToggleInput2,");
    typeCheck(dir);

    const compat = await importSource(
      dir,
      "./document-models/board/compat/v1/index.ts",
    );
    expect(Object.keys(compat)).toEqual(
      expect.arrayContaining(
        generated.filter(
          (name) =>
            name !== "isDefinedNonNullAny" &&
            name !== "definedNonNullAnySchema",
        ),
      ),
    );

    const namespace = await importSource(
      dir,
      "./document-models/board/index.ts",
    );
    const { reducer, actions, utils } = namespace.BoardV1 as Module;
    expect(utils.fileExtension).toBe("brd");
    let document = reducer(
      utils.createDocument(),
      actions.rename({ name: "Plan" }),
    ) as unknown as {
      state: {
        global: { name: string; status: string; items: unknown[] };
        local: { collapsed: boolean };
      };
    };
    document = reducer(document, actions.addItem({ name: "a" })) as never;
    document = reducer(document, actions.toggle({ collapsed: true })) as never;
    expect(document.state.global).toMatchObject({
      name: "Plan",
      status: "OPEN",
      items: [{ name: "a", weight: null }],
    });
    expect(document.state.local).toEqual({ collapsed: true });
  }, 240_000);
});

const SPEC = "document-models/ledger/ledger.json";
const REDUCER = `${model(1)}/src/reducers/entries.ts`;

type StoredLedger = typeof ledgerModel;

/** Changes version 1 of the stored ledger. */
function editSpecification(
  change: (specification: StoredLedger["specifications"][number]) => void,
) {
  const stored = JSON.parse(read(dir, SPEC)) as StoredLedger;
  change(stored.specifications[0]);
  write(SPEC, JSON.stringify(stored, null, 2));
}

function editFile(path: string, from: string | RegExp, to: string) {
  const before = read(dir, path);
  const after = before.replace(from, to);
  if (after === before) throw new Error(`${path} has no ${String(from)}`);
  write(path, after);
}

const globalState = (
  specification: StoredLedger["specifications"][number],
  from: string,
  to: string,
) => {
  specification.state.global.schema = specification.state.global.schema.replace(
    from,
    to,
  );
};

describe("migrateDocumentModel refusals", () => {
  it.each([
    {
      case: "a specification that is not JSON",
      change: () => write(SPEC, "{"),
      file: SPEC,
      reason: `${SPEC} is not JSON`,
    },
    {
      case: "a specification that is not a document model",
      change: () => write(SPEC, "null"),
      file: SPEC,
      reason: `${SPEC} is not a stored document model`,
    },
    {
      case: "a specification with a malformed version",
      change: () =>
        editSpecification((specification) => {
          (specification.state as { local?: unknown }).local = undefined;
        }),
      file: SPEC,
      reason: "at specifications.0.state.local",
    },
    {
      case: "SDL that does not parse",
      change: () =>
        editSpecification((specification) =>
          globalState(specification, "type LedgerTag {", "type LedgerTag {{"),
        ),
      file: SPEC,
      reason: "does not parse",
    },
    {
      case: "a type declared twice",
      change: () =>
        editSpecification((specification) => {
          specification.modules[0].operations[1].schema +=
            "\n\ntype LedgerTag {\n  name: String!\n}";
        }),
      file: SPEC,
      reason: "declares the type LedgerTag twice",
    },
    {
      case: "a scalar declaration",
      change: () =>
        editSpecification((specification) =>
          globalState(
            specification,
            "type LedgerTag {",
            "scalar Money\n\ntype LedgerTag {",
          ),
        ),
      file: SPEC,
      reason:
        "has a ScalarTypeDefinition, which a code-first document model cannot declare",
    },
    {
      case: "a directive",
      change: () =>
        editSpecification((specification) =>
          globalState(
            specification,
            "  title: String\n",
            "  title: String @audited\n",
          ),
        ),
      file: SPEC,
      reason: "uses the directive @audited",
    },
    {
      case: "a field with arguments",
      change: () =>
        editSpecification((specification) =>
          globalState(
            specification,
            "  title: String\n",
            "  title(locale: String): String\n",
          ),
        ),
      file: SPEC,
      reason: "takes arguments, which a document model state field cannot",
    },
    {
      case: "a field of an undeclared type",
      change: () =>
        editSpecification((specification) =>
          globalState(specification, "  title: String\n", "  title: Missing\n"),
        ),
      file: SPEC,
      reason: "has the type Missing, which version 1 does not declare",
    },
    {
      case: "two operations with one key",
      change: () =>
        editSpecification((specification) => {
          specification.modules[0].operations[1].name = "ADD_ENTRY";
        }),
      file: SPEC,
      reason:
        "has two operations, addEntry and ADD_ENTRY, with the key addEntry",
    },
    {
      case: "an operation whose key does not derive its action type",
      change: () =>
        editSpecification((specification) => {
          specification.modules[0].operations[1].name = "SET_A_B";
        }),
      file: SPEC,
      reason:
        "The operation SET_A_B of version 1 has the action type SET_A_B, which the code-first key setAB does not derive",
    },
    {
      case: "an operation without its input",
      change: () =>
        editSpecification((specification) => {
          specification.modules[0].operations[1].schema =
            "input RetitleInput {\n  title: String\n}";
        }),
      file: SPEC,
      reason:
        "The operation SET_TITLE of version 1 declares no input SetTitleInput",
    },
    {
      case: "an error without a name",
      change: () =>
        editSpecification((specification) => {
          specification.modules[0].operations[0].errors[0].name = " ";
        }),
      file: SPEC,
      reason: "An error of addEntry in version 1 has no name",
    },
    {
      case: "an initial value that is not JSON",
      change: () =>
        editSpecification((specification) => {
          specification.state.global.initialValue = "{";
        }),
      file: SPEC,
      reason: "The global initial value of version 1 is not JSON",
    },
    {
      case: "interfaces that implement each other",
      change: () =>
        editSpecification((specification) =>
          globalState(
            specification,
            "type LedgerTag {",
            "interface LedgerNamed implements LedgerLabeled {\n  name: String!\n}\n\ninterface LedgerLabeled implements LedgerNamed {\n  name: String!\n}\n\ntype LedgerTag {",
          ),
        ),
      file: SPEC,
      reason: "again through union members or implemented interfaces",
    },
    {
      case: "a state type the model's name does not derive",
      change: () =>
        editSpecification((specification) =>
          globalState(specification, "type LedgerState {", "type LedgerRoot {"),
        ),
      file: SPEC,
      reason: "declares no object type LedgerState",
    },
    {
      case: "two modules with one key",
      change: () =>
        editSpecification((specification) => {
          specification.modules.push({
            ...specification.modules[0],
            id: "entries-again",
            name: "Entries",
            operations: [],
          });
        }),
      file: SPEC,
      reason: "Two modules of version 1 derive the same key",
    },
    {
      case: "a version without an upgrade transition",
      change: () => rmSync(join(dir, "document-models/ledger/upgrades/v2.ts")),
      file: "document-models/ledger/upgrades/v2.ts",
      reason: "Version 2 has no upgrade transition in upgrades/v2.ts",
    },
    {
      case: "an upgrade that does not export its transition",
      change: () =>
        editFile(
          "document-models/ledger/upgrades/v2.ts",
          "export const v2:",
          "export const toV2:",
        ),
      file: "document-models/ledger/upgrades/v2.ts",
      reason: "upgrades/v2.ts exports no transition named v2",
    },
    {
      case: "a version without generated code",
      change: () =>
        rmSync(join(dir, `${model(1)}/gen`), { recursive: true, force: true }),
      file: `${model(1)}/gen/index.ts`,
      reason: "Version 1 has no generated code",
    },
    {
      case: "a module file the project already has",
      change: () =>
        write(`${model(1)}/modules/entries.ts`, "export const kept = true;\n"),
      file: `${model(1)}/modules/entries.ts`,
      reason: `${model(1)}/modules/entries.ts already exists`,
    },
    {
      case: "a reducer object without an operation",
      change: () =>
        editFile(
          REDUCER,
          / {2}setTitleOperation: \(ledger[\s\S]*?\n {2}},\n/,
          "",
        ),
      file: REDUCER,
      reason: "ledgerEntriesOperations has no setTitleOperation",
    },
    {
      case: "a reducer that is a value",
      change: () =>
        editFile(
          REDUCER,
          /setTitleOperation: \(ledger, action\) => \{[\s\S]*?\n {2}},/,
          "setTitleOperation: [] as never,",
        ),
      file: REDUCER,
      reason:
        "ledgerEntriesOperations.setTitleOperation is neither a method nor a function",
    },
    ...[
      'function selected(this: unknown, state: { title: string | null }, action: { input: { title?: string | null } }) { state.title = this === undefined ? "lost receiver" : action.input.title ?? null; }',
      "let selected = (state: { title: string | null }, action: { input: { title?: string | null } }) => { state.title = action.input.title ?? null; };",
    ].map((helper) => ({
      case: `a reference whose receiver or selected callable can change: ${helper}`,
      change: () => {
        editFile(
          REDUCER,
          "export const ledgerEntriesOperations",
          `${helper}\nexport const ledgerEntriesOperations`,
        );
        editFile(
          REDUCER,
          / {2}setTitleOperation: \(ledger[\s\S]*?\n {2}},\n/,
          "  setTitleOperation: selected,\n",
        );
      },
      file: REDUCER,
      reason: "selected is not an immutable arrow reference",
    })),
    {
      case: "a referenced reducer with a local Reflect binding",
      change: () => {
        editFile(
          REDUCER,
          "export const ledgerEntriesOperations",
          "const Reflect = {}; const selected = () => {};\nexport const ledgerEntriesOperations",
        );
        editFile(
          REDUCER,
          / {2}setTitleOperation: \(ledger[\s\S]*?\n {2}},\n/,
          "  setTitleOperation: selected,\n",
        );
      },
      file: REDUCER,
      reason: "this file declares Reflect",
    },
    {
      case: "a reducer method without a body",
      change: () =>
        editFile(
          REDUCER,
          / {2}setTitleOperation: \(ledger[\s\S]*?\n {2}},\n/,
          "  setTitleOperation(ledger, action);\n",
        ),
      file: REDUCER,
      reason: "ledgerEntriesOperations.setTitleOperation has no body",
    },
    {
      case: "an async reducer",
      change: () =>
        editFile(
          REDUCER,
          "addEntryOperation(state",
          "async addEntryOperation(state",
        ),
      file: REDUCER,
      reason:
        "ledgerEntriesOperations.addEntryOperation is async or a generator",
    },
    {
      case: "a reducer with a rest parameter",
      change: () =>
        editFile(
          REDUCER,
          "setTitleOperation: (ledger, action) => {",
          "setTitleOperation: (...[ledger, action]) => {",
        ),
      file: REDUCER,
      reason:
        "ledgerEntriesOperations.setTitleOperation takes a rest parameter",
    },
    {
      case: "a reducer that reads its arguments object",
      change: () =>
        editFile(
          REDUCER,
          "addEntryOperation(state, { input }) {",
          "addEntryOperation(state, { input }) { void arguments[1];",
        ),
      file: REDUCER,
      reason: "reads arguments, whose values change",
    },
    {
      case: "a reducer that reads its call frame through direct eval",
      change: () =>
        editFile(
          REDUCER,
          "addEntryOperation(state, { input }) {",
          'addEntryOperation(state, { input }) { void eval("arguments[1].input");',
        ),
      file: REDUCER,
      reason: "calls eval, which can read bindings and arguments",
    },
    {
      case: "a reducer sibling helper that evaluates the removed operations binding",
      change: () =>
        write(
          REDUCER,
          `${readFileSync(join(dir, REDUCER), "utf8")}\nfunction observesBinding() { return eval("typeof notesEntriesOperations"); }\nvoid observesBinding;`,
        ),
      file: REDUCER,
      reason: "calls eval, which can read bindings and arguments",
    },
    {
      case: "a relocated helper with a relative asset URL",
      change: () => {
        write(
          `${model(1)}/src/read.ts`,
          'import { readFileSync } from "node:fs"; export const read = () => readFileSync(new URL("./note.txt", import.meta.url), "utf8");',
        );
        write(`${model(1)}/src/note.txt`, "authored asset");
      },
      file: `${model(1)}/src/read.ts`,
      reason: "reads import.meta, whose module location changes",
    },
    ...[
      {
        source:
          'function observesBinding() { return eval("typeof ledgerEntriesOperations"); } void observesBinding;',
        reason: "calls eval, which can read bindings and arguments",
      },
      {
        source: "export const sourceUrl = import.meta.url;",
        reason: "reads import.meta, whose module location changes",
      },
    ].map(({ source, reason }) => ({
      case: `a selected reducer outside the usual source directory: ${source}`,
      change: () => {
        const relocated = `${model(1)}/shared/src/reducers/entries.ts`;
        write(
          relocated,
          `${readFileSync(join(dir, REDUCER), "utf8")}\n${source}\n`,
        );
        rmSync(join(dir, REDUCER));
        editFile(
          `${model(1)}/gen/reducer.ts`,
          "../src/reducers/entries.js",
          "../shared/src/reducers/entries.js",
        );
      },
      file: `${model(1)}/shared/src/reducers/entries.ts`,
      reason,
    })),
    {
      case: "a named function-expression reducer",
      change: () =>
        editFile(
          REDUCER,
          "setTitleOperation: (ledger, action) => {",
          "setTitleOperation: function recur(ledger, action) {",
        ),
      file: REDUCER,
      reason: "is a named function expression",
    },
    {
      case: "a fourth reducer parameter with a default",
      change: () =>
        editFile(
          REDUCER,
          "setTitleOperation: (ledger, action) => {",
          'setTitleOperation: (ledger, action, dispatch, suffix = "!") => {',
        ),
      file: REDUCER,
      reason: "declares parameters beyond state, action and dispatch",
    },
    {
      case: "this in a reducer parameter initializer",
      change: () =>
        editFile(
          REDUCER,
          "addEntryOperation(state, { input }) {",
          "addEntryOperation(state, { input }, dispatch = this) {",
        ),
      file: REDUCER,
      reason: "uses this, which means ledgerEntriesOperations",
    },
    ...[
      {
        case: "arguments in a computed method name",
        body: "const nested = { [arguments[1].input.id]() {} }; void nested;",
        reason: "reads arguments",
      },
      {
        case: "this in a computed method name",
        body: "const nested = { [this.addEntryOperation.name]() {} }; void nested;",
        reason: "uses this",
      },
      {
        case: "this in a method parameter decorator",
        body: "const mark = (_value: unknown): ParameterDecorator => () => {}; class Nested { method(@mark(this) value?: string) { void value; } } void Nested;",
        reason: "uses this",
      },
      {
        case: "arguments in a constructor parameter decorator",
        body: "const mark = (_value: unknown): ParameterDecorator => () => {}; class Nested { constructor(@mark(arguments[1]) value?: string) { void value; } } void Nested;",
        reason: "reads arguments",
      },
      {
        case: "this in class heritage",
        body: "class Nested extends (this === undefined ? class {} : class {}) {} void Nested;",
        reason: "uses this",
      },
    ].map(({ case: name, body, reason }) => ({
      case: name,
      change: () =>
        editFile(
          REDUCER,
          "addEntryOperation(state, { input }) {",
          `addEntryOperation(state, { input }) { ${body}`,
        ),
      file: REDUCER,
      reason,
    })),
    {
      case: "a side-effect-only import of the reducer file",
      change: () =>
        write(
          "initialize.ts",
          `import "./${REDUCER.replace(/\.ts$/, ".js")}";\n`,
        ),
      file: "initialize.ts",
      reason: "only for its side effects",
    },
    {
      case: "a module without a reducer object",
      change: () => {
        editFile(
          REDUCER,
          "LedgerEntriesOperations = {",
          "LedgerEntriesOperations = Object.freeze({",
        );
        editFile(REDUCER, /\n};\n$/, "\n});\n");
      },
      file: REDUCER,
      reason:
        "No directly exported reducer object for the entries module was found",
    },
    {
      case: "a reducer file that uses its own reducer object",
      change: () =>
        write(
          REDUCER,
          `${read(dir, REDUCER)}\nexport const operationNames = Object.keys(ledgerEntriesOperations);\n`,
        ),
      file: REDUCER,
      reason: "The reducer file calls ledgerEntriesOperations itself",
    },
  ])(
    "refuses $case",
    async ({ change, file, reason }) => {
      await implementLedger(dir);
      change();
      expectRefusal(await migrate(), { file, reason });
    },
    120_000,
  );

  it.each([
    "setTitleOperation",
    "state",
    "_input",
    "context",
    "action",
    "dispatch",
    "st\\u0061te",
  ])(
    "keeps the referenced reducer %s without capturing its name",
    async (helper) => {
      const canonical = helper.replace("st\\u0061te", "state");
      await implementLedger(dir);
      editFile(
        REDUCER,
        "export const ledgerEntriesOperations: LedgerEntriesOperations = {",
        `const ${helper} = (ledger: { title: string | null }, action: { input: { title?: string | null } }) => {\n  ledger.title = trimmed(action.input.title);\n};\n\nexport const ledgerEntriesOperations: LedgerEntriesOperations = {\n  ${helper === "setTitleOperation" ? helper : `setTitleOperation: ${helper}`},`,
      );
      editFile(
        REDUCER,
        / {2}setTitleOperation: \(ledger[\s\S]*?\n {2}},\n/,
        "",
      );
      const migration = await migrate();
      if (migration.kind !== "converted") {
        throw new Error(
          migration.refusals.map(({ reason }) => reason).join("; "),
        );
      }
      const module = migration.files.find(
        ({ path }) => path === `${model(1)}/modules/entries.ts`,
      );
      expect(module?.after).toContain(
        `// ph migrate: ${canonical} keeps its schema-first signature and all three arguments.`,
      );
      expect(migration.notes).toContainEqual(
        expect.stringContaining(
          `Version 1: the SET_TITLE reducer calls ${canonical} through Reflect.apply`,
        ),
      );
      apply(migration);
      await regenerateDocumentModelBarrels(dir);
      typeCheck(dir);
      const namespace = await importSource(
        dir,
        "./document-models/ledger/index.ts",
      );
      const { reducer, actions, utils } = namespace.LedgerV1 as Module;
      expect(
        reducer(utils.createDocument(), actions.setTitle({ title: " Q1 " }))
          .state.global.title,
      ).toBe("Q1");
    },
    120_000,
  );
});
