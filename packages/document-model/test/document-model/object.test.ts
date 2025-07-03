import { generateId } from "../../../document-model/src/document/utils/crypto.js";
import { DocumentModelClass } from "../../src/document-model/gen/object.js";

describe("DocumentModel Class", () => {
  it("should create an empty document", () => {
    const model = new DocumentModelClass();
    expect(model.name).toBe("");
    expect(model.documentType).toBe("powerhouse/document-model");
    expect(model.getRevision("global")).toBe(0);
    expect(model.operations.global.length).toBe(0);

    expect(model.state.global.id).toBe("");
    expect(model.state.global.name).toBe("");
    expect(model.state.global.description).toBe("");
    expect(model.state.global.extension).toBe("");
    expect(model.state.global.specifications.length).toBe(1);
    expect(model.state.global.specifications[0].version).toBe(1);
    expect(model.state.global.specifications[0].changeLog.length).toBe(0);
    expect(model.state.global.specifications[0].modules.length).toBe(0);
    expect(model.state.global.author).toEqual({
      name: "",
      website: "",
    });
  });

  it("should apply basic operations", () => {
    const model = new DocumentModelClass();

    model
      .setModelId({ id: "<id>" })
      .setModelName({ name: "<name>" })
      .setModelDescription({ description: "<description>" })
      .setModelExtension({ extension: "phdm" })
      .setAuthorName({ authorName: "<authorName>" })
      .setAuthorWebsite({ authorWebsite: "<authorWebsite>" });

    expect(model.state.global.id).toBe("<id>");
    expect(model.state.global.name).toBe("<name>");
    expect(model.state.global.description).toBe("<description>");
    expect(model.state.global.extension).toBe("phdm");
    expect(model.state.global.author).toEqual({
      name: "<authorName>",
      website: "<authorWebsite>",
    });
  });

  it("should apply module operations to the latest specification", () => {
    const model = new DocumentModelClass();

    model
      .addModule({ id: generateId(), name: "state" })
      .addModule({ id: generateId(), name: "header" });

    expect(
      model.state.global.specifications[0].modules.map((m) => m.name),
    ).toStrictEqual(["state", "header"]);

    expect(model.state.global.specifications[0].modules[0].id).toMatch(
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,
    );
    expect(model.state.global.specifications[0].modules[0].name).toBe("state");
    expect(model.state.global.specifications[0].modules[0].description).toBe(
      "",
    );
    expect(
      model.state.global.specifications[0].modules[0].operations.length,
    ).toBe(0);

    model.reorderModules({
      order: [
        model.state.global.specifications[0].modules[1].id,
        model.state.global.specifications[0].modules[0].id,
      ],
    });

    expect(
      model.state.global.specifications[0].modules.map((m) => m.name),
    ).toStrictEqual(["header", "state"]);

    const headerModuleId = model.state.global.specifications[0].modules[0].id;
    const stateModuleId = model.state.global.specifications[0].modules[1].id;

    model.setModuleName({ id: headerModuleId, name: "Header" });
    model.setModuleDescription({
      id: headerModuleId,
      description: "<header description>",
    });
    model.deleteModule({ id: stateModuleId });

    expect(model.state.global.specifications[0].modules).toStrictEqual([
      {
        id: headerModuleId,
        name: "Header",
        description: "<header description>",
        operations: [],
      },
    ]);
  });

  it("should apply operations operations to the latest spec", () => {
    const model = new DocumentModelClass();

    model
      .addModule({ id: generateId(), name: "header" })
      .addModule({ id: generateId(), name: "state" });

    const headerModuleId = model.state.global.specifications[0].modules[0].id;
    const stateModuleId = model.state.global.specifications[0].modules[1].id;

    model.addOperation({
      id: generateId(),
      moduleId: headerModuleId,
      name: "SetModuleExtension",
      schema: "<SetModuleExtension.schema>",
      description: "<SetModuleExtension.description>",
      template: "<SetModuleExtension.template>",
      reducer: "<SetModuleExtension.reducer>",
      scope: "local",
    });

    model.addOperation({
      id: generateId(),
      moduleId: stateModuleId,
      name: "AddStateExample",
    });

    const setModuleExtensionId =
      model.state.global.specifications[0].modules[0].operations[0].id;
    const addStateExampleId =
      model.state.global.specifications[0].modules[1].operations[0].id;

    expect(model.state.global.specifications[0].modules[0]).toEqual({
      id: headerModuleId,
      name: "header",
      description: "",
      operations: [
        {
          id: setModuleExtensionId,
          name: "SetModuleExtension",
          schema: "<SetModuleExtension.schema>",
          description: "<SetModuleExtension.description>",
          template: "<SetModuleExtension.template>",
          reducer: "<SetModuleExtension.reducer>",
          examples: [],
          errors: [],
          scope: "local",
        },
      ],
    });

    expect(model.state.global.specifications[0].modules[1]).toEqual({
      id: stateModuleId,
      name: "state",
      description: "",
      operations: [
        {
          id: addStateExampleId,
          name: "AddStateExample",
          schema: "",
          description: "",
          template: "",
          reducer: "",
          examples: [],
          errors: [],
          scope: "global",
        },
      ],
    });

    model.moveOperation({
      operationId: setModuleExtensionId,
      newModuleId: stateModuleId,
    });

    expect(model.state.global.specifications[0].modules[0]).toEqual({
      id: headerModuleId,
      name: "header",
      description: "",
      operations: [],
    });

    expect(model.state.global.specifications[0].modules[1]).toEqual({
      id: stateModuleId,
      name: "state",
      description: "",
      operations: [
        {
          id: addStateExampleId,
          name: "AddStateExample",
          schema: "",
          description: "",
          template: "",
          reducer: "",
          examples: [],
          errors: [],
          scope: "global",
        },
        {
          id: setModuleExtensionId,
          name: "SetModuleExtension",
          schema: "<SetModuleExtension.schema>",
          description: "<SetModuleExtension.description>",
          template: "<SetModuleExtension.template>",
          reducer: "<SetModuleExtension.reducer>",
          examples: [],
          errors: [],
          scope: "local",
        },
      ],
    });

    model.reorderModuleOperations({
      moduleId: stateModuleId,
      order: [setModuleExtensionId, addStateExampleId],
    });

    expect(model.state.global.specifications[0].modules[1].operations).toEqual([
      {
        id: setModuleExtensionId,
        name: "SetModuleExtension",
        schema: "<SetModuleExtension.schema>",
        description: "<SetModuleExtension.description>",
        template: "<SetModuleExtension.template>",
        reducer: "<SetModuleExtension.reducer>",
        examples: [],
        errors: [],
        scope: "local",
      },
      {
        id: addStateExampleId,
        name: "AddStateExample",
        schema: "",
        description: "",
        template: "",
        reducer: "",
        examples: [],
        errors: [],
        scope: "global",
      },
    ]);

    model.setOperationName({
      id: addStateExampleId,
      name: "SetAuthorName",
    });
    model.setOperationSchema({
      id: addStateExampleId,
      schema: "<SetAuthorName.schema>",
    });
    model.setOperationDescription({
      id: addStateExampleId,
      description: "<SetAuthorName.description>",
    });
    model.setOperationReducer({
      id: addStateExampleId,
      reducer: "<SetAuthorName.reducer>",
    });
    model.setOperationTemplate({
      id: addStateExampleId,
      template: "<SetAuthorName.template>",
    });
    model.setOperationScope({
      id: addStateExampleId,
      scope: "local",
    });

    const updatedValue = {
      id: addStateExampleId,
      name: "SetAuthorName",
      schema: "<SetAuthorName.schema>",
      description: "<SetAuthorName.description>",
      template: "<SetAuthorName.template>",
      reducer: "<SetAuthorName.reducer>",
      examples: [],
      errors: [],
      scope: "local",
    };

    expect(
      model.state.global.specifications[0].modules[1].operations[1],
    ).toEqual(updatedValue);

    model.deleteOperation({ id: setModuleExtensionId });
    expect(
      model.state.global.specifications[0].modules[1].operations.length,
    ).toBe(1);
    expect(
      model.state.global.specifications[0].modules[1].operations[0],
    ).toEqual(updatedValue);
  });
});
