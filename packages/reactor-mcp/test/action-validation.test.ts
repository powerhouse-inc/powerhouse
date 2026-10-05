import { withSignaturePolicy } from "@powerhousedao/shared/document-model";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type { OperationSpecification } from "@powerhousedao/shared/document-model";
import {
  defineDocumentModel,
  defineDocumentModelFamily,
  documentModelDocumentModelModule,
  ph,
  schemaFirstSpecification,
  type OperationNameOverrides,
} from "document-model";
import { describe, expect, it } from "vitest";
import { createReactorMcpProvider } from "../src/tools/reactor.js";
import { validateDocumentModelAction } from "../src/tools/utils.js";

const NAMING_OVERRIDES = [
  { storedName: "RenameTitle" },
  { storedName: "UPDATE_TITLE", actionType: "UPDATE_TITLE" },
] satisfies OperationNameOverrides[];
const SINGLE_VERSION_MANIFEST = {
  documentType: "test/action-names",
  latestVersion: 1,
  supportedVersions: [1],
  upgrades: {},
};

function versionWithNames<const TVersion extends number>(
  names: OperationNameOverrides,
  version: TVersion,
) {
  const model = defineDocumentModel({
    id: "test/action-names",
    name: "ActionNames",
    description: "",
    extension: "names",
    version,
    author: { name: "Powerhouse" },
    specifications: {
      global: {
        schema: ph.object("ActionNamesState", {
          fields: { title: ph.String({ required: true }) },
        }),
        initialValue: { title: "" },
      },
      local: { schema: null, initialValue: {} },
    },
  });
  const editing = model.module("editing", {
    operations: ({ global }) => ({
      setTitle: global({
        input: ph.input({ fields: { title: ph.String({ required: true }) } }),
        reduce(state, input) {
          state.title = input.title;
        },
      }),
    }),
  });
  return model.version({
    modules: [editing],
    compatibility: schemaFirstSpecification({
      names: { "operation/editing/setTitle": names },
    }),
  });
}

describe("validateDocumentModelAction", () => {
  it.each(NAMING_OVERRIDES)("accepts compiled naming overrides %j", (names) => {
    const model = defineDocumentModelFamily({
      versions: [versionWithNames(names, 1)],
      upgradeManifest: SINGLE_VERSION_MANIFEST,
    }).at(1);
    const action = model.actions.setTitle({ title: "Renamed" });

    expect(validateDocumentModelAction(model, action)).toStrictEqual({
      isValid: true,
      errors: [],
    });
    expect(
      model.reducer(model.utils.createDocument(), action).state.global,
    ).toEqual({
      title: "Renamed",
    });
  });

  it("rejects invalid inputs and scopes with compiled naming overrides", () => {
    const model = defineDocumentModelFamily({
      versions: [versionWithNames(NAMING_OVERRIDES[1], 1)],
      upgradeManifest: SINGLE_VERSION_MANIFEST,
    }).at(1);
    const action = model.actions.setTitle({ title: "Renamed" });

    const invalidInput = validateDocumentModelAction(model, {
      ...action,
      input: { title: 42 },
    });
    expect(invalidInput.isValid).toBe(false);
    expect(invalidInput.errors[0]).toContain("Input validation error");
    expect(
      validateDocumentModelAction(model, { ...action, scope: "local" }),
    ).toStrictEqual({
      isValid: false,
      errors: ['Action scope "local" does not match operation scope "global"'],
    });
  });

  it("uses the selected version's names when a family carries newer specifications", () => {
    const family = defineDocumentModelFamily({
      versions: [
        versionWithNames({ storedName: "SET_TITLE" }, 1),
        versionWithNames(
          { storedName: "UPDATE_TITLE", actionType: "UPDATE_TITLE" },
          2,
        ),
      ],
      upgradeManifest: {
        documentType: "test/action-names",
        latestVersion: 2,
        supportedVersions: [1, 2],
        upgrades: {
          v2: { toVersion: 2, upgradeReducer: (document) => document },
        },
      },
    });
    const original = family.at(1);
    expect(original.documentModel.global.specifications).toHaveLength(2);
    expect(
      validateDocumentModelAction(
        original,
        original.actions.setTitle({ title: "Renamed" }),
      ),
    ).toStrictEqual({ isValid: true, errors: [] });
    expect(
      validateDocumentModelAction(
        original,
        family.at(2).actions.setTitle({ title: "Renamed" }),
      ),
    ).toStrictEqual({
      isValid: false,
      errors: [
        'Operation "UPDATE_TITLE" is not defined in any module of the document model',
      ],
    });
  });

  it("preserves exact legacy matching with null and normalized names", () => {
    const original = documentModelDocumentModelModule;
    const specification = original.documentModel.global.specifications.at(-1)!;
    const module = specification.modules.find((entry) =>
      entry.operations.some((operation) => operation.name === "SET_MODEL_NAME"),
    )!;
    const operation = module.operations.find(
      (entry) => entry.name === "SET_MODEL_NAME",
    )!;
    const aliases: OperationSpecification[] = [
      { ...operation, name: null },
      { ...operation, name: "SetModelName", scope: "local" },
      operation,
    ];
    const model = {
      ...original,
      documentModel: {
        ...original.documentModel,
        global: {
          ...original.documentModel.global,
          specifications: [
            { ...specification, modules: [{ ...module, operations: aliases }] },
          ],
        },
      },
    };

    expect(
      validateDocumentModelAction(
        model,
        original.actions.setModelName({ name: "Renamed" }),
      ),
    ).toStrictEqual({ isValid: true, errors: [] });
  });
});

describe("addActions", () => {
  it.each(NAMING_OVERRIDES)(
    "executes compiled naming overrides %j",
    async (names) => {
      const model = defineDocumentModelFamily({
        versions: [versionWithNames(names, 1)],
        upgradeManifest: SINGLE_VERSION_MANIFEST,
      }).at(1);
      const reactorModule = await new ReactorClientBuilder()
        .withReactorBuilder(
          new ReactorBuilder().withDocumentModelSources([model]),
        )
        .buildModule();
      const { client } = reactorModule;
      try {
        const document = await client.create(
          withSignaturePolicy(model.utils.createDocument(), "legacy"),
        );
        const provider = await createReactorMcpProvider({ client });
        const result = await provider.tools.addActions.callback({
          documentId: document.header.id,
          actions: [model.actions.setTitle({ title: "Renamed" })],
        });

        expect(result.isError).toBeUndefined();
        expect(result.structuredContent).toStrictEqual({ success: true });
        const updated = await client.get(document.header.id);
        expect(updated.state).toMatchObject({ global: { title: "Renamed" } });
        const operations = await client.getOperations(document.header.id);
        expect(operations.results.at(-1)?.error).toBeUndefined();
      } finally {
        reactorModule.reactor.kill();
      }
    },
  );
});
