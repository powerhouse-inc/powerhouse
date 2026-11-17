import { ts } from "@tmpl/core";

export type CodeFirstDocumentModelTemplateArgs = {
  readonly displayName: string;

  readonly pascalName: string;

  readonly camelName: string;

  readonly kebabName: string;
  readonly documentType: string;
  readonly author: { readonly name: string; readonly website: string | null };
};

export const codeFirstDefinitionTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
/**
 * Version 1 of the ${v.displayName} document model: its metadata, state types
 * and initial state. Codegen writes this file once and never regenerates it.
 */
import { defineDocumentModel, ph } from "document-model";

export const ${v.pascalName}Item = ph.object("${v.pascalName}Item", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
    done: ph.Boolean({ required: true }),
  },
});

export const ${v.camelName}Model = defineDocumentModel({
  id: ${JSON.stringify(v.documentType)},
  name: ${JSON.stringify(v.displayName)},
  description: "",
  extension: ".${v.kebabName}",
  version: 1,
  author: {
    name: ${JSON.stringify(v.author.name)},
    website: ${JSON.stringify(v.author.website)},
  },
  scopes: {
    global: {
      schema: ph.object("${v.pascalName}State", {
        fields: {
          items: ph.list(ph.ref(${v.pascalName}Item, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { items: [] },
    },
  },
});
`.raw;

export const codeFirstItemsModuleTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
/**
 * The ${v.displayName} item operations. Each one declares its input and its
 * errors and changes the state in place. The action types, action creators and
 * stored schema derive from these declarations.
 */
import { ph } from "document-model";
import { ${v.camelName}Model } from "../definition.js";

export const ${v.camelName}Items = ${v.camelName}Model.module("items", {
  operations: ({ global }) => ({
    addItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          label: ph.String({ required: true }),
        },
      }),
      errors: { DuplicateItem: { code: "DUPLICATE_ITEM" } },
      reduce(state, input, { errors }) {
        if (state.items.some((item) => item.id === input.id)) {
          throw new errors.DuplicateItem(\`Item \${input.id} is already in the list.\`);
        }
        state.items.push({ id: input.id, label: input.label, done: false });
      },
    }),

    setItemDone: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          done: ph.Boolean({ required: true }),
        },
      }),
      errors: { MissingItem: { code: "MISSING_ITEM" } },
      reduce(state, input, { errors }) {
        const item = state.items.find((candidate) => candidate.id === input.id);
        if (item === undefined) {
          throw new errors.MissingItem(\`No item has id \${input.id}.\`);
        }
        item.done = input.done;
      },
    }),
  }),
});
`.raw;

/** A version's modules: the exported module constant and its file under `modules/`. */
export type CodeFirstVersionModules = readonly {
  readonly constName: string;
  readonly file: string;
}[];

/**
 * A version's `index.ts`. Scaffolding writes version 1 with its items
 * module; migrating a stored model writes every version with its modules.
 */
export const codeFirstVersionTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
  version = 1,
  modules: CodeFirstVersionModules = [
    { constName: `${v.camelName}Items`, file: "items" },
  ],
) =>
  ts`
/**
 * Version ${version} of the ${v.displayName} model. To add version ${version + 1}, copy this
 * directory to \`v${version + 1}\`, set \`version: ${version + 1}\` in its \`definition.ts\`, and list the
 * new version in \`../index.ts\` and in \`../upgrades/index.ts\`.
 */
import { ${v.camelName}Model } from "./definition.js";
${modules.map(({ constName, file }) => `import { ${constName} } from "./modules/${file}.js";`).join("\n")}

export const ${v.camelName}V${version} = ${v.camelName}Model.version({
  modules: [${modules.map(({ constName }) => constName).join(", ")}],
});
`.raw;

/** `upgrades/index.ts`: every version after the first imports its transition from `vN.ts`. */
export const codeFirstUpgradesTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
  versions: readonly number[] = [1],
) => {
  const transitions = versions.slice(1);
  return ts`
/**
 * Every version the ${v.displayName} model publishes, and the upgrade into
 * each version after the first. Version N adds \`vN.ts\` beside this file with
 * the transition from version N-1, lists N in \`supportedVersions\`, and keys
 * the transition here as \`vN\`.
 */
import { latestVersionOf, type UpgradeManifest } from "document-model";${transitions.map((version) => `\nimport { v${version} } from "./v${version}.js";`).join("")}

const supportedVersions = [${versions.join(", ")}] as const;

export const ${v.camelName}UpgradeManifest: UpgradeManifest<
  typeof supportedVersions
> = {
  documentType: ${JSON.stringify(v.documentType)},
  latestVersion: latestVersionOf(supportedVersions),
  supportedVersions,
  upgrades: {${transitions.length === 0 ? "" : ` ${transitions.map((version) => `v${version}`).join(", ")} `}},
};
`.raw;
};

/** The model's `index.ts`: the family of every version, the latest one, and the manifest. */
export const codeFirstIndexTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
  versions: readonly number[] = [1],
) =>
  ts`
/**
 * The ${v.displayName} document model. Each version is a named export, and
 * \`${v.pascalName}\` is the latest one.
 */
import { defineDocumentModelFamily, materialize } from "document-model";
import { ${v.camelName}UpgradeManifest as declaredUpgradeManifest } from "./upgrades/index.js";
${versions.map((version) => `import { ${v.camelName}V${version} } from "./v${version}/index.js";`).join("\n")}

const family = materialize(
  defineDocumentModelFamily({
    versions: [${versions.map((version) => `${v.camelName}V${version}`).join(", ")}],
    upgradeManifest: declaredUpgradeManifest,
  }),
);

${versions.map((version) => `export const ${v.pascalName}V${version} = family.at(${version});`).join("\n\n")}

export const ${v.pascalName} = ${v.pascalName}V${versions.at(-1) ?? 1};

export const ${v.camelName}UpgradeManifest = family.upgradeManifest;
`.raw;

export const codeFirstDocumentModelTestTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
import { describe, expect, it } from "vitest";
import { ${v.pascalName}V1 } from "../../index.js";

describe("${v.displayName} v1", () => {
  it("creates a document with the declared initial state", () => {
    const document = ${v.pascalName}V1.utils.createDocument();
    expect(document.header.documentType).toBe(${JSON.stringify(v.documentType)});
    expect(document.state.global).toStrictEqual({ items: [] });
  });
});
`.raw;

export const codeFirstItemsTestTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
import { describe, expect, it } from "vitest";
import { ${v.pascalName}V1 } from "../../index.js";

const { actions, reducer, utils } = ${v.pascalName}V1;

describe("${v.displayName} v1 items", () => {
  it("adds an item and marks it done", () => {
    let document = reducer(
      utils.createDocument(),
      actions.addItem({ id: "item-1", label: "Write it down" }),
    );
    document = reducer(document, actions.setItemDone({ id: "item-1", done: true }));
    expect(document.state.global.items).toStrictEqual([
      { id: "item-1", label: "Write it down", done: true },
    ]);
  });

  it("records the declared error for a duplicate id", () => {
    const add = actions.addItem({ id: "item-1", label: "Once" });
    const document = reducer(reducer(utils.createDocument(), add), add);
    expect(document.operations.global.at(-1)?.error).toBe(
      "Item item-1 is already in the list.",
    );
  });

  it("records the declared error for a missing item", () => {
    const document = reducer(
      utils.createDocument(),
      actions.setItemDone({ id: "item-2", done: true }),
    );
    expect(document.operations.global.at(-1)?.error).toBe(
      "No item has id item-2.",
    );
  });

  it("refuses an input the declaration does not allow", () => {
    expect(() =>
      actions.addItem({ id: "item-1", label: 1 as unknown as string }),
    ).toThrow();
  });
});
`.raw;
