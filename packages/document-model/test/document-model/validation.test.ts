import type {
  DocumentModelPHState,
  ModuleSpecification,
  OperationSpecification,
  ValidationError,
} from "document-model";
import {
  addModule,
  addOperation,
  documentModelCreateDocument,
  documentModelReducer,
  getAllOperationNames,
  isReservedOperationName,
  RESERVED_OPERATION_NAMES,
  setOperationName,
  setStateSchema,
  validateInitialState,
  validateModule,
  validateModuleOperation,
  validateModules,
  validateOperationName,
  validateStateSchemaName,
} from "document-model";

describe("DocumentModel Validation Error", () => {
  const documentName = "testDocument";
  let doc = documentModelCreateDocument();

  beforeEach(() => {
    doc = documentModelCreateDocument({
      id: "test-id",
      name: documentName,
      description: "test description",
      extension: "phdm",
      authorName: "test author",
      authorWebsite: "www.test.com",
    } as Partial<DocumentModelPHState>);
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
      const newDoc = documentModelReducer(
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
      const newDoc = documentModelReducer(
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

      const newDoc = documentModelReducer(
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

      const newDoc2 = documentModelReducer(
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

      const newDoc = documentModelReducer(
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

      const newDoc2 = documentModelReducer(
        newDoc,
        setStateSchema({
          scope: "local",
          schema: "type testdocumentLocalState {}",
        }),
      );

      errors = [
        ...errors,
        ...validateStateSchemaName(
          newDoc2.state.global.specifications[0].state.local.schema,
          documentName,
          "local",
        ),
      ];

      const newDoc3 = documentModelReducer(
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

    it("should return error when schema has superset type name (e.g., TodoState2 instead of TodoState)", () => {
      const newDoc = documentModelReducer(
        doc,
        setStateSchema({
          scope: "global",
          schema: "type TestDocumentState2 { id: ID! }",
        }),
      );

      const errors = validateStateSchemaName(
        newDoc.state.global.specifications[0].state.global.schema,
        documentName,
      );

      expect(errors.length).toBe(1);
      expect(errors[0].message).toContain("Expected type TestDocumentState");
    });

    it("should pass when schema has correct type plus additional types", () => {
      const newDoc = documentModelReducer(
        doc,
        setStateSchema({
          scope: "global",
          schema: `
            type TestDocumentState {
              id: ID!
              items: [Item!]!
            }

            type Item {
              name: String!
            }
          `,
        }),
      );

      const errors = validateStateSchemaName(
        newDoc.state.global.specifications[0].state.global.schema,
        documentName,
      );

      expect(errors.length).toBe(0);
    });

    it("should not report type name error when correct type exists even with invalid GraphQL syntax", () => {
      // This function only validates the type name, not GraphQL syntax
      // Syntax validation is handled elsewhere
      const errors = validateStateSchemaName(
        "type TestDocumentState { invalid syntax",
        documentName,
      );

      // No type name error since the correct type name is present
      expect(errors.length).toBe(0);
    });
  });

  describe("module", () => {
    it("should report error when module has no name defined", () => {
      const mod: ModuleSpecification = {
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
      const mod: ModuleSpecification = {
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
      const mod: ModuleSpecification = {
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
      const operation: OperationSpecification = {
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
      const operation: OperationSpecification = {
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
      const operation: OperationSpecification = {
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

  describe("operation name validation", () => {
    describe("isReservedOperationName", () => {
      it("should return true for all reserved names (exact case)", () => {
        for (const name of RESERVED_OPERATION_NAMES) {
          expect(isReservedOperationName(name)).toBe(true);
        }
      });

      it("should return true for reserved names (lowercase)", () => {
        expect(isReservedOperationName("undo")).toBe(true);
        expect(isReservedOperationName("redo")).toBe(true);
        expect(isReservedOperationName("prune")).toBe(true);
        expect(isReservedOperationName("load_state")).toBe(true);
        expect(isReservedOperationName("set_name")).toBe(true);
        expect(isReservedOperationName("noop")).toBe(true);
      });

      it("should return true for reserved names (mixed case)", () => {
        expect(isReservedOperationName("Undo")).toBe(true);
        expect(isReservedOperationName("Set_Name")).toBe(true);
        expect(isReservedOperationName("Load_State")).toBe(true);
      });

      it("should return false for non-reserved names", () => {
        expect(isReservedOperationName("CREATE_USER")).toBe(false);
        expect(isReservedOperationName("UPDATE")).toBe(false);
        expect(isReservedOperationName("MY_UNDO")).toBe(false);
        expect(isReservedOperationName("UNDO_ACTION")).toBe(false);
      });
    });

    describe("getAllOperationNames", () => {
      it("should return empty array when no specifications exist", () => {
        const state = {
          ...doc.state.global,
          specifications: [],
        };
        const names = getAllOperationNames(state);
        expect(names).toEqual([]);
      });

      it("should return all operation names in uppercase", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-2", moduleId: "mod-1", name: "update_user" }),
        );

        const names = getAllOperationNames(testDoc.state.global);
        expect(names).toContain("CREATE_USER");
        expect(names).toContain("UPDATE_USER");
        expect(names.length).toBe(2);
      });

      it("should exclude operation by id", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-2", moduleId: "mod-1", name: "UPDATE_USER" }),
        );

        const names = getAllOperationNames(testDoc.state.global, "op-1");
        expect(names).not.toContain("CREATE_USER");
        expect(names).toContain("UPDATE_USER");
        expect(names.length).toBe(1);
      });
    });

    describe("validateOperationName", () => {
      it("should throw error for reserved names", () => {
        expect(() => validateOperationName("UNDO", doc.state.global)).toThrow(
          /reserved/,
        );
        expect(() =>
          validateOperationName("set_name", doc.state.global),
        ).toThrow(/reserved/);
        expect(() =>
          validateOperationName("Load_State", doc.state.global),
        ).toThrow(/reserved/);
      });

      it("should throw error for duplicate names (same case)", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );

        expect(() =>
          validateOperationName("CREATE_USER", testDoc.state.global),
        ).toThrow(/already used/);
      });

      it("should throw error for duplicate names (different case)", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );

        expect(() =>
          validateOperationName("create_user", testDoc.state.global),
        ).toThrow(/already used/);
        expect(() =>
          validateOperationName("Create_User", testDoc.state.global),
        ).toThrow(/already used/);
      });

      it("should not throw for valid unique names", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );

        expect(() =>
          validateOperationName("UPDATE_USER", testDoc.state.global),
        ).not.toThrow();
        expect(() =>
          validateOperationName("DELETE_USER", testDoc.state.global),
        ).not.toThrow();
      });

      it("should allow renaming to same name (exclude current operation)", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );

        expect(() =>
          validateOperationName("CREATE_USER", testDoc.state.global, "op-1"),
        ).not.toThrow();
      });

      it("should not throw for empty names", () => {
        expect(() => validateOperationName("", doc.state.global)).not.toThrow();
      });
    });

    describe("addOperation reducer validation", () => {
      // Helper to get the last operation's error
      function getLastOperationError(
        document: ReturnType<typeof documentModelReducer>,
      ): string | undefined {
        const ops = document.operations.global;
        return ops[ops.length - 1]?.error;
      }

      it("should record error when adding operation with reserved name", () => {
        const testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );

        const result1 = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "UNDO" }),
        );
        expect(getLastOperationError(result1)).toMatch(/reserved/);

        const result2 = documentModelReducer(
          testDoc,
          addOperation({ id: "op-2", moduleId: "mod-1", name: "set_name" }),
        );
        expect(getLastOperationError(result2)).toMatch(/reserved/);
      });

      it("should record error when adding operation with duplicate name", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "Module1" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addModule({ id: "mod-2", name: "Module2" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );

        // Duplicate in same module should fail
        const result1 = documentModelReducer(
          testDoc,
          addOperation({
            id: "op-2",
            moduleId: "mod-1",
            name: "CREATE_USER",
          }),
        );
        expect(getLastOperationError(result1)).toMatch(/already used/);

        // Duplicate in different module should also fail
        const result2 = documentModelReducer(
          testDoc,
          addOperation({
            id: "op-3",
            moduleId: "mod-2",
            name: "CREATE_USER",
          }),
        );
        expect(getLastOperationError(result2)).toMatch(/already used/);
      });

      it("should allow adding operation with valid unique name", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "CREATE_USER" }),
        );

        const result = documentModelReducer(
          testDoc,
          addOperation({
            id: "op-2",
            moduleId: "mod-1",
            name: "UPDATE_USER",
          }),
        );
        expect(getLastOperationError(result)).toBeUndefined();
      });
    });

    describe("setOperationName reducer validation", () => {
      // Helper to get the last operation's error
      function getLastOperationError(
        document: ReturnType<typeof documentModelReducer>,
      ): string | undefined {
        const ops = document.operations.global;
        return ops[ops.length - 1]?.error;
      }

      it("should record error when renaming to reserved name", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "VALID_NAME" }),
        );

        const result = documentModelReducer(
          testDoc,
          setOperationName({ id: "op-1", name: "SET_NAME" }),
        );
        expect(getLastOperationError(result)).toMatch(/reserved/);
      });

      it("should record error when renaming to duplicate name", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "OP_ONE" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-2", moduleId: "mod-1", name: "OP_TWO" }),
        );

        const result = documentModelReducer(
          testDoc,
          setOperationName({ id: "op-2", name: "OP_ONE" }),
        );
        expect(getLastOperationError(result)).toMatch(/already used/);
      });

      it("should allow renaming operation to its current name", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "MY_OPERATION" }),
        );

        const result = documentModelReducer(
          testDoc,
          setOperationName({ id: "op-1", name: "MY_OPERATION" }),
        );
        expect(getLastOperationError(result)).toBeUndefined();
      });

      it("should allow renaming to valid unique name", () => {
        let testDoc = documentModelReducer(
          doc,
          addModule({ id: "mod-1", name: "TestModule" }),
        );
        testDoc = documentModelReducer(
          testDoc,
          addOperation({ id: "op-1", moduleId: "mod-1", name: "OLD_NAME" }),
        );

        const result = documentModelReducer(
          testDoc,
          setOperationName({ id: "op-1", name: "NEW_NAME" }),
        );
        expect(getLastOperationError(result)).toBeUndefined();
      });
    });
  });
});
