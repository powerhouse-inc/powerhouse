import {
  validateInitialState,
  validateModule,
  validateModuleOperation,
  validateModules,
  validateStateSchemaName,
} from "../../src/document-model/custom/custom-utils.js";
import { setStateSchema } from "../../src/document-model/gen/creators.js";
import { createDocument } from "../../src/document-model/gen/document-model-utils.js";
import { reducer } from "../../src/document-model/gen/reducer.js";
import {
  DocumentModelLocalState,
  DocumentModelState,
  Module,
  Operation,
} from "../../src/document-model/gen/schema/types.js";
import {
  ExtendedState,
  PartialState,
  ValidationError,
} from "../../src/document/types.js";

describe("DocumentModel Validation Error", () => {
  const documentName = "testDocument";
  let doc = createDocument();

  beforeEach(() => {
    doc = createDocument({
      id: "test-id",
      name: documentName,
      description: "test description",
      extension: "phdm",
      authorName: "test author",
      authorWebsite: "www.test.com",
    } as Partial<
      ExtendedState<
        PartialState<DocumentModelState>,
        PartialState<DocumentModelLocalState>
      >
    >);
  });

  describe("initial state", () => {
    it("should report errors if initialState is invalid", () => {
      const errors: ValidationError[] = [];

      errors.push(...validateInitialState(""));
      errors.push(...validateInitialState("{}}"));
      errors.push(...validateInitialState('{ "id": }'));

      expect(errors.length).toBe(3);
    });

    it("should report errors when initialState is empty and validateInitialState is called with allowEmptyState = false", () => {
      const errors = validateInitialState("{}", false);

      expect(errors.length).toBe(1);
    });

    it("should not report errors for empty initialState when allowEmptyState = true", () => {
      const errors = [
        ...validateInitialState("{}", true),
        ...validateInitialState("", true),
      ];

      expect(errors.length).toBe(0);
    });

    it("should not return errors if initialState is valid", () => {
      const errors = [
        ...validateInitialState('{ "id": 1 }', true),
        ...validateInitialState('{ "id": 1 }', false),
      ];

      expect(errors.length).toBe(0);
    });
  });

  describe("document schema", () => {
    it("should report error for empty schema", () => {
      const errors = validateStateSchemaName(
        doc.state.global.specifications[0].state.global.schema,
        documentName,
        "",
        false,
      );

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("State schema is required");
    });

    it("should not trigger empty schema error if allowEmptySchema = true", () => {
      const errors = validateStateSchemaName(
        doc.state.global.specifications[0].state.global.schema,
        documentName,
        "",
        true,
      );

      expect(errors.length).toBe(0);
    });

    it("should not return errors when Global State Name is the same as the document name", () => {
      const newDoc = reducer(
        doc,
        setStateSchema({
          scope: "global",
          schema: "type TestDocumentState {}",
        }),
      );

      const errors = validateStateSchemaName(
        newDoc.state.global.specifications[0].state.global.schema,
        documentName,
      );

      expect(errors.length).toBe(0);
    });

    it("should not return errors when Local State Name is the same as the document name", () => {
      const newDoc = reducer(
        doc,
        setStateSchema({
          scope: "local",
          schema: "type TestDocumentLocalState {}",
        }),
      );

      const errors = validateStateSchemaName(
        newDoc.state.global.specifications[0].state.local.schema,
        documentName,
        "local",
      );

      expect(errors.length).toBe(0);
    });

    it("should return errors when global state name type is not the same as the document name", () => {
      let errors: ValidationError[] = [];

      const newDoc = reducer(
        doc,
        setStateSchema({
          scope: "global",
          schema: "type CustomNameState {}",
        }),
      );

      errors = [
        ...errors,
        ...validateStateSchemaName(
          newDoc.state.global.specifications[0].state.global.schema,
          documentName,
        ),
      ];

      const newDoc2 = reducer(
        doc,
        setStateSchema({
          scope: "global",
          schema: "type testdocumentState {}",
        }),
      );

      errors = [
        ...errors,
        ...validateStateSchemaName(
          newDoc2.state.global.specifications[0].state.global.schema,
          documentName,
        ),
      ];

      expect(errors.length).toBe(2);
    });

    it("should return errors when local state name type is not the same as the document name", () => {
      let errors: ValidationError[] = [];

      const newDoc = reducer(
        doc,
        setStateSchema({
          scope: "local",
          schema: "type CustomNameLocalState {}",
        }),
      );

      errors = [
        ...errors,
        ...validateStateSchemaName(
          newDoc.state.global.specifications[0].state.local.schema,
          documentName,
        ),
      ];

      const newDoc2 = reducer(
        newDoc,
        setStateSchema({
          scope: "local",
          schema: "type testdocumentLocalState {}",
        }),
      );

      errors = [
        ...errors,
        ...validateStateSchemaName(
          doc.state.global.specifications[0].state.local.schema,
          documentName,
          "local",
        ),
      ];

      const newDoc3 = reducer(
        newDoc2,
        setStateSchema({
          scope: "local",
          schema: "type TestDocumentState {}",
        }),
      );

      errors = [
        ...errors,
        ...validateStateSchemaName(
          newDoc3.state.global.specifications[0].state.local.schema,
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

      const errors = validateModule(mod);

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

      const errors = validateModule(mod);

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

      const errors = validateModule(mod);

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

      const errors = validateModuleOperation(operation);

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

      const errors = validateModuleOperation(operation);

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

      const errors = validateModuleOperation(operation);

      expect(errors.length).toBe(0);
    });
  });

  describe("modules", () => {
    it("should report errors when there's no mdoules defined ", () => {
      const errors = validateModules([]);

      expect(errors.length).toBe(1);
      expect(errors[0].message).toBe("Modules are required");
    });

    it("should not report errors when modules are defined", () => {
      const errors = validateModules([
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
