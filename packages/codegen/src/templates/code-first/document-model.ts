import { ts } from "@tmpl/core";
import type { CodeFirstDocumentModelTemplateArgs } from "file-builders";

export const codeFirstDefinitionTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
/**
 * The ${v.name} document model's metadata and state. Nothing regenerates this
 * file, and \`ph model check\` reads it as the source of truth.
 */
import { defineDocumentModel, ph } from "document-model";

/** One item in the ${v.name} list. Add the fields the model needs. */
export const ${v.pascalCaseDocumentType}Item = ph.object("${v.pascalCaseDocumentType}Item", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
    done: ph.Boolean({ required: true }),
  },
});

export const ${v.contextName} = defineDocumentModel({
  id: "${v.documentType}",
  name: "${v.pascalCaseDocumentType}",
  description: "A ${v.name} document model.",
  extension: "${v.kebabCaseDocumentType}",
  version: 1,
  author: {
    name: ${JSON.stringify(v.author.name)},
    website: ${v.author.website === null ? "null" : JSON.stringify(v.author.website)},
  },
  specifications: {
    global: {
      schema: ph.object("${v.stateName}", {
        fields: {
          title: ph.String({ required: true }),
          items: ph.list(ph.ref(${v.pascalCaseDocumentType}Item, { required: true }), {
            required: true,
          }),
        },
      }),
      initialValue: { title: "", items: [] },
    },
    local: { schema: null, initialValue: {} },
  },
});
`.raw;

export const codeFirstModulesTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
/**
 * The ${v.name} operations. Each one declares its input and mutates the state
 * in place. The compiler derives the action type, the action creator, and the
 * stored schema from these declarations.
 */
import { ph } from "document-model";
import { ${v.contextName} } from "../definition.js";

export const ${v.itemsModuleName} = ${v.contextName}.module("items", {
  description: "Editing the ${v.name} list",
  operations: ({ global }) => ({
    setTitle: global({
      input: ph.input({ fields: { title: ph.String({ required: true }) } }),
      reduce(state, input) {
        state.title = input.title;
      },
    }),

    addItem: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          label: ph.String({ required: true }),
        },
      }),
      errors: { AlreadyPresent: {} },
      reduce(state, input, ctx) {
        if (state.items.some((item) => item.id === input.id)) {
          throw new ctx.errors.AlreadyPresent(
            \`A ${v.pascalCaseDocumentType}Item with id \${input.id} is already in the list.\`,
          );
        }
        state.items.push({ id: input.id, label: input.label, done: false });
      },
    }),

    setDone: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          done: ph.Boolean({ required: true }),
        },
      }),
      errors: { NotFound: {} },
      reduce(state, input, ctx) {
        const item = state.items.find((candidate) => candidate.id === input.id);
        if (item === undefined) {
          throw new ctx.errors.NotFound(\`No item with id \${input.id}.\`);
        }
        item.done = input.done;
      },
    }),
  }),
});
`.raw;

export const codeFirstVersionTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
/**
 * Version 1 of the ${v.name} model. To add version 2, copy this directory,
 * bump \`version\` in its \`definition.ts\`, and list the new version in the
 * family in \`../index.ts\` and in \`../upgrades/\`.
 */
import { ${v.contextName} } from "./definition.js";
import { ${v.itemsModuleName} } from "./modules/items.js";

export const ${v.definitionV1Name} = ${v.contextName}.version({
  modules: [${v.itemsModuleName}],
});
`.raw;

export const codeFirstVersionsTemplate = () =>
  ts`
import { latestVersionOf } from "document-model";

export const supportedVersions = [1] as const;

export const latestVersion = latestVersionOf(supportedVersions);
`.raw;

export const codeFirstUpgradeManifestTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
/**
 * Every version the ${v.name} model publishes, and the upgrade into each
 * version after the first. Version N adds \`vN.ts\` beside this file with the
 * transition from version N-1, lists N in \`versions.ts\`, and keys the
 * transition here as \`vN\`. The family checks this manifest against its
 * versions.
 */
import type { UpgradeManifest } from "document-model";
import { latestVersion, supportedVersions } from "./versions.js";

export const ${v.upgradeManifestName}: UpgradeManifest<typeof supportedVersions> = {
  documentType: "${v.documentType}",
  latestVersion,
  supportedVersions,
  upgrades: {},
};
`.raw;

export const codeFirstUpgradesIndexTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
export { ${v.upgradeManifestName} } from "./upgrade-manifest.js";
export { latestVersion, supportedVersions } from "./versions.js";
`.raw;

export const codeFirstIndexTemplate = (v: CodeFirstDocumentModelTemplateArgs) =>
  ts`
/**
 * The ${v.name} family and the modules the package publishes. Every version is
 * a named export, because a reactor worker imports a version by its export
 * name.
 */
import { defineDocumentModelFamily } from "document-model";
import { ${v.upgradeManifestName} } from "./upgrades/index.js";
import { ${v.definitionV1Name} } from "./v1/index.js";

// Not \`export * from "./upgrades/index.js"\`: \`document-models/index.ts\`
// re-exports this module with \`export *\`, so a second model's
// \`latestVersion\` would collide with this one.
export { ${v.upgradeManifestName} };

export const ${v.familyName} = defineDocumentModelFamily({
  versions: [${v.definitionV1Name}],
  upgradeManifest: ${v.upgradeManifestName},
});

export const ${v.moduleV1Name} = ${v.familyName}.at(1);

/** Every version this model publishes, latest last. */
export const documentModels = [${v.moduleV1Name}];

export const upgradeManifests = [${v.upgradeManifestName}];
`.raw;

export const codeFirstDocumentModelTestTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
import { describe, expect, it } from "vitest";
import { ${v.moduleV1Name} } from "../../index.js";

describe("${v.pascalCaseDocumentType} v1", () => {
  it("creates a document holding the declared initial state", () => {
    const document = ${v.moduleV1Name}.utils.createDocument();
    expect(document.header.documentType).toBe("${v.documentType}");
    expect(document.state.global).toStrictEqual({ title: "", items: [] });
  });

  it("publishes its compiled definition", () => {
    // \`ph model check\`, the GraphQL host, and the MCP schema tool read the
    // structured definition.
    expect(${v.moduleV1Name}.definition.kind).toBe("powerhouse.document-model");
    expect(${v.moduleV1Name}.documentModel.global.id).toBe("${v.documentType}");
  });
});
`.raw;

export const codeFirstItemsTestTemplate = (
  v: CodeFirstDocumentModelTemplateArgs,
) =>
  ts`
import { describe, expect, it } from "vitest";
import { ${v.moduleV1Name} } from "../../index.js";

// An action creator validates its input, so an invalid input throws before
// the reducer runs. A domain error is recorded on the operation instead.
describe("${v.pascalCaseDocumentType} v1 items", () => {
  it("sets the title", () => {
    const document = ${v.moduleV1Name}.utils.createDocument();
    const next = ${v.moduleV1Name}.reducer(
      document,
      ${v.moduleV1Name}.actions.setTitle({ title: "First" }),
    );
    expect(next.state.global.title).toBe("First");
  });

  it("adds an item and marks it done", () => {
    let document = ${v.moduleV1Name}.utils.createDocument();
    document = ${v.moduleV1Name}.reducer(
      document,
      ${v.moduleV1Name}.actions.addItem({ id: "item-1", label: "Write it down" }),
    );
    expect(document.state.global.items).toHaveLength(1);

    document = ${v.moduleV1Name}.reducer(
      document,
      ${v.moduleV1Name}.actions.setDone({ id: "item-1", done: true }),
    );
    expect(document.state.global.items[0].done).toBe(true);
  });

  it("refuses a duplicate id with the declared error", () => {
    let document = ${v.moduleV1Name}.utils.createDocument();
    const add = () =>
      ${v.moduleV1Name}.actions.addItem({ id: "item-1", label: "Once" });
    document = ${v.moduleV1Name}.reducer(document, add());
    document = ${v.moduleV1Name}.reducer(document, add());
    expect(document.operations.global.at(-1)?.error).toContain(
      "already in the list",
    );
  });

  it("refuses an input the declaration does not allow", () => {
    expect(() =>
      ${v.moduleV1Name}.actions.setTitle({ title: 12 as unknown as string }),
    ).toThrow();
  });
});
`.raw;
