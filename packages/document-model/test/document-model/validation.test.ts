import {
  DocumentModel,
  Module,
  Operation,
  utils,
} from "../../src/document-model";
import { ValidationError } from "../../src/document";

describe("DocumentModel Validation Error", () => {
  const documentName = "testDocument";
  let doc: DocumentModel;

  beforeEach(() => {
    doc = new DocumentModel();

    doc
      .setModelId({ id: "test-id" })
      .setModelName({ name: documentName })
      .setModelDescription({ description: "test description" })
      .setModelExtension({ extension: "phdm" })
      .setAuthorName({ authorName: "test author" })
      .setAuthorWebsite({ authorWebsite: "www.test.com" });
  });

  describe("initial state", () => {
    it("should report errors if initialState is invalid", () => {
      const errors: ValidationError[] = [];

      errors.push(...utils.validateInitialState(""));
      errors.push(...utils.validateInitialState("{}}"));
      errors.push(...utils.validateInitialState('{ "id": }'));

      expect(errors.length).toBe(3);
    });

    it("should report errors when initialState is empty and validateInitialState is called with allowEmptyState = false", () => {
      const errors = utils.validateInitialState("{}", false);

      expect(errors.length).toBe(1);
    });

    it("should not report errors for empty initialState when allowEmptyState = true", () => {
      const errors = [
        ...utils.validateInitialState("{}", true),
        ...utils.validateInitialState("", true),
      ];

      expect(errors.length).toBe(0);
    });

    it("should not return errors if initialState is valid", () => {
      const errors = [
        ...utils.validateInitialState('{ "id": 1 }', true),
        ...utils.validateInitialState('{ "id": 1 }', false),
      ];

      expect(errors.length).toBe(0);
    });
  });

  describe("document schema", () => {
    it("should report error for empty schema", () => {
      const errors = utils.validateStateSchemaName(
        doc.state.global.specifications[0].state.global.schema,
        documentName,
        "",
        false,
      );

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("State schema is required");
    });

    it("should not trigger empty schema error if allowEmptySchema = true", () => {
      const errors = utils.validateStateSchemaName(
        doc.state.global.specifications[0].state.global.schema,
        documentName,
        "",
        true,
      );

      expect(errors.length).toBe(0);
    });

    it("should not return errors when Global State Name is the same as the document name", () => {
      doc.setStateSchema({
        scope: "global",
        schema: "type TestDocumentState {}",
      });

      const errors = utils.validateStateSchemaName(
        doc.state.global.specifications[0].state.global.schema,
        documentName,
      );

      expect(errors.length).toBe(0);
    });

    it("should not return errors when Local State Name is the same as the document name", () => {
      doc.setStateSchema({
        scope: "local",
        schema: "type TestDocumentLocalState {}",
      });

      const errors = utils.validateStateSchemaName(
        doc.state.global.specifications[0].state.local.schema,
        documentName,
        "local",
      );

      expect(errors.length).toBe(0);
    });

    it("should return errors when global state name type is not the same as the document name", () => {
      let errors: ValidationError[] = [];

      doc.setStateSchema({
        scope: "global",
        schema: "type CustomNameState {}",
      });

      errors = [
        ...errors,
        ...utils.validateStateSchemaName(
          doc.state.global.specifications[0].state.global.schema,
          documentName,
        ),
      ];

      doc.setStateSchema({
        scope: "global",
        schema: "type testdocumentState {}",
      });

      errors = [
        ...errors,
        ...utils.validateStateSchemaName(
          doc.state.global.specifications[0].state.global.schema,
          documentName,
        ),
      ];

      expect(errors.length).toBe(2);
    });

    it("should return errors when local state name type is not the same as the document name", () => {
      let errors: ValidationError[] = [];

      doc.setStateSchema({
        scope: "local",
        schema: "type CustomNameLocalState {}",
      });

      errors = [
        ...errors,
        ...utils.validateStateSchemaName(
          doc.state.global.specifications[0].state.local.schema,
          documentName,
        ),
      ];

      doc.setStateSchema({
        scope: "local",
        schema: "type testdocumentLocalState {}",
      });

      errors = [
        ...errors,
        ...utils.validateStateSchemaName(
          doc.state.global.specifications[0].state.local.schema,
          documentName,
          "local",
        ),
      ];

      doc.setStateSchema({
        scope: "local",
        schema: "type TestDocumentState {}",
      });

      errors = [
        ...errors,
        ...utils.validateStateSchemaName(
          doc.state.global.specifications[0].state.local.schema,
          documentName,
          "local",
        ),
      ];

      expect(errors.length).toBe(3);
    });
  });

  describe("module", () => {
    it("should report error when module has no name defined", () => {
      const mod: Module = {
        name: "",
        description: "test description",
        id: "test-id",
        operations: [
          {
            description: "",
            id: "",
            errors: [],
            examples: [],
            name: "test-operation",
            reducer: "",
            schema: "input TestOperationInput {}",
            scope: "global",
            template: "",
          },
        ],
      };

      const errors = utils.validateModule(mod);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Module name is required");
    });

    it("should report error when module has no operations defined", () => {
      const mod: Module = {
        name: "test-module",
        description: "test description",
        id: "test-id",
        operations: [],
      };

      const errors = utils.validateModule(mod);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Module operations are required");
    });

    it("should not report errors when module is valid", () => {
      const mod: Module = {
        name: "test-module",
        description: "test description",
        id: "test-id",
        operations: [
          {
            description: "",
            id: "",
            errors: [],
            examples: [],
            name: "test-operation",
            reducer: "",
            schema: "input TestOperationInput {}",
            scope: "global",
            template: "",
          },
        ],
      };

      const errors = utils.validateModule(mod);

      expect(errors.length).toBe(0);
    });
  });

  describe("operation", () => {
    it("should report an error when operation name is not defined", () => {
      const operation: Operation = {
        description: "",
        id: "",
        errors: [],
        examples: [],
        name: "",
        reducer: "",
        schema: "input TestOperationInput {}",
        scope: "global",
        template: "",
      };

      const errors = utils.validateModuleOperation(operation);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Operation name is required");
    });

    it("should report an error when operation schema is not defined", () => {
      const operation: Operation = {
        description: "",
        id: "",
        errors: [],
        examples: [],
        name: "test-operation",
        reducer: "",
        schema: "",
        scope: "global",
        template: "",
      };

      const errors = utils.validateModuleOperation(operation);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Operation schema is required");
    });

    it("should not report errors when operation is valid", () => {
      const operation: Operation = {
        description: "",
        id: "",
        errors: [],
        examples: [],
        name: "test-operation",
        reducer: "",
        schema: "input TestOperationInput {}",
        scope: "global",
        template: "",
      };

      const errors = utils.validateModuleOperation(operation);

      expect(errors.length).toBe(0);
    });
  });

  describe("modules", () => {
    it("should report errors when there's no mdoules defined ", () => {
      const errors = utils.validateModules([]);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Modules are required");
    });

    it("should not report errors when modules are defined", () => {
      const errors = utils.validateModules([
        {
          name: "test-module",
          description: "test description",
          id: "test-id",
          operations: [
            {
              description: "",
              id: "",
              errors: [],
              examples: [],
              name: "test-operation",
              reducer: "",
              schema: "input TestOperationInput {}",
              scope: "global",
              template: "",
            },
          ],
        },
      ]);

      expect(errors.length).toBe(0);
    });
  });
});
