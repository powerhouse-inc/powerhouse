/* eslint-disable @typescript-eslint/no-floating-promises */
import type { DocumentNode, ObjectTypeDefinitionNode } from "graphql";
import { Kind, parse } from "graphql";
import assert from "node:assert";
import { describe, it } from "node:test";
import {
  makeMinimalObjectForStateType,
  makeStateSchemaNameForScope,
  StateValidationError,
  validateStateObject,
} from "./helpers.js";
function getStateTypeNode(
  sdl: string,
  typeName: string,
): ObjectTypeDefinitionNode {
  const doc = parse(sdl);
  const typeNode = doc.definitions.find(
    (def) =>
      def.kind === Kind.OBJECT_TYPE_DEFINITION &&
      (def as ObjectTypeDefinitionNode).name.value === typeName,
  ) as ObjectTypeDefinitionNode;
  if (!typeNode) {
    throw new Error(`Type ${typeName} not found in schema`);
  }
  return typeNode;
}

/**
 * Helper to simulate the component's flow of finding the state type
 * from a shared schema (like in state-schemas.tsx lines 83-94)
 */
function getStateTypeFromSharedSchema(
  sharedSchemaDoc: DocumentNode,
  modelName: string,
  scope: "global" | "local",
): ObjectTypeDefinitionNode | null {
  const stateTypeName = makeStateSchemaNameForScope(modelName, scope);
  const stateTypeDefinitionNode = sharedSchemaDoc.definitions.find(
    (def) =>
      def.kind === Kind.OBJECT_TYPE_DEFINITION &&
      def.name.value === stateTypeName,
  );
  if (
    !stateTypeDefinitionNode ||
    stateTypeDefinitionNode.kind !== Kind.OBJECT_TYPE_DEFINITION
  ) {
    return null;
  }
  return stateTypeDefinitionNode;
}

describe("makeMinimalObjectForStateType - filling missing fields", () => {
  it("should preserve existing valid values", () => {
    const sdl = `
      type TestState {
        name: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({ name: "test" });

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(result, JSON.stringify({ name: "test" }, null, 2));
  });

  it("should fill missing optional field with null", () => {
    const sdl = `
      type TestState {
        name: String
        age: Int
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({ name: "test" });

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      result,
      JSON.stringify({ name: "test", age: null }, null, 2),
    );
  });

  it("should fill missing required list field with empty array", () => {
    const sdl = `
      type TestState {
        items: [Item!]!
      }

      type Item {
        id: ID!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({});

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(result, JSON.stringify({ items: [] }, null, 2));

    const errors = validateStateObject(doc, typeNode, result);
    assert.strictEqual(errors.length, 0);
  });

  it("should fill missing optional list field with null", () => {
    const sdl = `
      type TestState {
        items: [String]
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({});

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(result, JSON.stringify({ items: null }, null, 2));
  });

  it("should preserve existing array values", () => {
    const sdl = `
      type TestState {
        items: [String!]!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({ items: ["a", "b"] });

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(result, JSON.stringify({ items: ["a", "b"] }, null, 2));
  });

  it("should handle nested objects with missing fields", () => {
    const sdl = `
      type TestState {
        nested: NestedType
      }

      type NestedType {
        value: String
        count: Int
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({ nested: { value: "test" } });

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      result,
      JSON.stringify({ nested: { value: "test", count: null } }, null, 2),
    );
  });

  it("should handle multiple missing fields", () => {
    const sdl = `
      type TestState {
        name: String
        age: Int
        active: Boolean
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({});

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      result,
      JSON.stringify({ name: null, age: null, active: null }, null, 2),
    );
  });
});

describe("validateStateObject", () => {
  it("should return empty array for valid state", () => {
    const sdl = `
      type TestState {
        name: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({ name: "test" });

    const errors = validateStateObject(doc, typeNode, value);

    assert.strictEqual(errors.length, 0);
  });

  it("should return error for invalid JSON", () => {
    const sdl = `
      type TestState {
        name: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = "invalid json";

    const errors = validateStateObject(doc, typeNode, value);

    assert.strictEqual(errors.length, 1);
    assert.ok(errors[0].message.includes("Invalid JSON"));
  });

  it("should return error for missing required field", () => {
    const sdl = `
      type TestState {
        name: String!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({});

    const errors = validateStateObject(doc, typeNode, value);

    assert.ok(errors.length > 0);
    const stateError = errors[0] as StateValidationError;
    assert.strictEqual(stateError.kind, "MISSING");
    assert.strictEqual(stateError.field, "name");
  });

  it("should return error for wrong type", () => {
    const sdl = `
      type TestState {
        count: Int
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({ count: "not a number" });

    const errors = validateStateObject(doc, typeNode, value);

    assert.ok(errors.length > 0);
    const stateError = errors[0] as StateValidationError;
    assert.strictEqual(stateError.kind, "TYPE");
  });

  it("should return error for unknown field", () => {
    const sdl = `
      type TestState {
        name: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({ name: "test", unknownField: "value" });

    const errors = validateStateObject(doc, typeNode, value);

    assert.ok(errors.length > 0);
    const stateError = errors[0] as StateValidationError;
    assert.strictEqual(stateError.kind, "UNKNOWN_FIELD");
  });

  it("should detect missing optional fields", () => {
    const sdl = `
      type TestState {
        name: String
        age: Int
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({ name: "test" });

    const errors = validateStateObject(doc, typeNode, value);

    assert.ok(errors.length > 0);
    const stateError = errors[0] as StateValidationError;
    assert.strictEqual(stateError.kind, "MISSING_OPTIONAL");
    assert.strictEqual(stateError.field, "age");
  });

  it("should not detect missing optional fields on empty array", () => {
    const sdl = `
      type TestState {
        items: [Item!]!
      }

      type Item {
        text: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({ items: [] });

    const errors = validateStateObject(doc, typeNode, value);
    const stateError = errors.at(0);
    assert.ifError(stateError);
  });

  it("should return NON_NULL error for null value in required field", () => {
    const sdl = `
      type TestState {
        name: String!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({ name: null });

    const errors = validateStateObject(doc, typeNode, value);

    assert.ok(errors.length > 0);
    const stateError = errors[0] as StateValidationError;
    assert.strictEqual(stateError.kind, "NON_NULL");
  });
});

describe("makeMinimalObjectForStateType", () => {
  it("should preserve existing valid values", () => {
    const sdl = `
      type TestState {
        name: String
        count: Int
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({ name: "test", count: 42 }),
    });

    assert.strictEqual(
      result,
      JSON.stringify({ name: "test", count: 42 }, null, 2),
    );
  });

  it("should fill missing fields with default values", () => {
    const sdl = `
      type TestState {
        name: String!
        count: Int!
        active: Boolean!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(
      result,
      JSON.stringify({ name: "", count: 0, active: false }, null, 2),
    );
  });

  it("should set required list fields to empty array", () => {
    const sdl = `
      type TestState {
        items: [Item!]!
      }

      type Item {
        id: ID!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(result, JSON.stringify({ items: [] }, null, 2));
  });

  it("should set optional list fields to null when missing", () => {
    const sdl = `
      type TestState {
        items: [String]
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(result, JSON.stringify({ items: null }, null, 2));
  });

  it("should preserve existing array values", () => {
    const sdl = `
      type TestState {
        items: [String!]!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({ items: ["a", "b", "c"] }),
    });

    assert.strictEqual(
      result,
      JSON.stringify({ items: ["a", "b", "c"] }, null, 2),
    );
  });

  it("should handle enum fields with default value", () => {
    const sdl = `
      type TestState {
        status: Status!
      }

      enum Status {
        ACTIVE
        INACTIVE
        PENDING
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(result, JSON.stringify({ status: "ACTIVE" }, null, 2));
  });

  it("should preserve valid enum values", () => {
    const sdl = `
      type TestState {
        status: Status!
      }

      enum Status {
        ACTIVE
        INACTIVE
        PENDING
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({ status: "PENDING" }),
    });

    assert.strictEqual(result, JSON.stringify({ status: "PENDING" }, null, 2));
  });

  it("should handle nested object types", () => {
    const sdl = `
      type TestState {
        nested: NestedType!
      }

      type NestedType {
        value: String!
        count: Int!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(
      result,
      JSON.stringify({ nested: { value: "", count: 0 } }, null, 2),
    );
  });

  it("should return original value for invalid JSON", () => {
    const sdl = `
      type TestState {
        name: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const invalidJson = "not valid json";

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: invalidJson,
    });

    assert.strictEqual(result, invalidJson);
  });

  it("should handle ID fields with placeholder", () => {
    const sdl = `
      type TestState {
        id: ID!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(
      result,
      JSON.stringify({ id: "placeholder-id" }, null, 2),
    );
  });

  it("should handle Float fields", () => {
    const sdl = `
      type TestState {
        price: Float!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(result, JSON.stringify({ price: 0 }, null, 2));
  });

  it("should replace invalid type values with defaults", () => {
    const sdl = `
      type TestState {
        count: Int!
        name: String!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({ count: "not a number", name: 123 }),
    });

    assert.strictEqual(result, JSON.stringify({ count: 0, name: "" }, null, 2));
  });
});

describe("Integration: Component flow simulation", () => {
  it("should handle the syncWithSchema=true flow (validate -> makeMinimal)", () => {
    const sdl = `
      type TestModelState {
        name: String!
        items: [String!]!
        count: Int
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeFromSharedSchema(doc, "TestModel", "global");
    assert.ok(typeNode, "State type should be found");

    const existingValue = JSON.stringify({ name: "test" });

    // Step 1: validateStateObject with checkMissingOptionalFields
    const errors = validateStateObject(doc, typeNode, existingValue);

    // Should have errors for missing fields (items is required, count is optional)
    assert.ok(errors.length > 0, "Should have validation errors");

    // Step 2: makeMinimalObjectForStateType to fix (when syncWithSchema=true)
    const fixedState = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      fixedState,
      JSON.stringify({ name: "test", items: [], count: null }, null, 2),
    );
  });

  it("should handle the syncWithSchema=false flow (validate with checkMissingOptionalFields)", () => {
    const sdl = `
      type TestModelState {
        name: String!
        description: String
        tags: [String]
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeFromSharedSchema(doc, "TestModel", "global");
    assert.ok(typeNode, "State type should be found");

    const existingValue = JSON.stringify({ name: "test" });

    // When syncWithSchema is false, we check for missing optional fields
    const errors = validateStateObject(doc, typeNode, existingValue);

    // Should have 2 MISSING_OPTIONAL errors (description and tags)
    const missingOptionalErrors = errors.filter(
      (e) => e instanceof StateValidationError && e.kind === "MISSING_OPTIONAL",
    );
    assert.strictEqual(missingOptionalErrors.length, 2);
  });

  it("should use makeMinimalObjectForStateType as fallback when validation fails", () => {
    const sdl = `
      type TestModelState {
        count: Int!
        active: Boolean!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeFromSharedSchema(doc, "TestModel", "global");
    assert.ok(typeNode, "State type should be found");

    // Invalid state with wrong types
    const existingValue = JSON.stringify({
      count: "not a number",
      active: "not a boolean",
    });

    // Validation should fail
    const errors = validateStateObject(doc, typeNode, existingValue);
    assert.ok(errors.length > 0, "Should have validation errors");

    // makeMinimalObjectForStateType should fix it
    const fixedState = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      fixedState,
      JSON.stringify({ count: 0, active: false }, null, 2),
    );
  });

  it("should handle empty string initial value (converted to '{}')", () => {
    const sdl = `
      type TestModelState {
        name: String!
        items: [Item!]!
      }

      type Item {
        id: ID!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeFromSharedSchema(doc, "TestModel", "global");
    assert.ok(typeNode, "State type should be found");

    // Component converts empty string to "{}" (line 80)
    const existingValue = "{}";

    // Validate should find errors for missing required fields
    const errors = validateStateObject(doc, typeNode, existingValue);
    assert.ok(errors.length > 0, "Should have validation errors");

    // makeMinimalObjectForStateType fills in defaults
    const fixedState = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      fixedState,
      JSON.stringify({ name: "", items: [] }, null, 2),
    );
  });

  it("should handle local state with LocalState suffix", () => {
    const sdl = `
      type TestModelLocalState {
        localData: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeFromSharedSchema(doc, "TestModel", "local");
    assert.ok(typeNode, "Local state type should be found");

    const existingValue = JSON.stringify({});

    // Validate should find missing optional field
    const errors = validateStateObject(doc, typeNode, existingValue);
    assert.strictEqual(
      errors.length,
      1,
      "Should have 1 missing optional field",
    );

    // makeMinimalObjectForStateType fills in defaults
    const fixedState = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      fixedState,
      JSON.stringify({ localData: null }, null, 2),
    );
  });
});

describe("Edge cases", () => {
  it("makeMinimalObjectForStateType should handle deeply nested objects", () => {
    const sdl = `
      type TestState {
        level1: Level1!
      }

      type Level1 {
        level2: Level2!
      }

      type Level2 {
        value: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify({
      level1: {
        level2: {},
      },
    });

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    assert.strictEqual(
      result,
      JSON.stringify({ level1: { level2: { value: null } } }, null, 2),
    );
  });

  it("validateStateObject should handle nested object type errors", () => {
    const sdl = `
      type TestState {
        nested: NestedType!
      }

      type NestedType {
        count: Int!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({
      nested: { count: "not a number" },
    });

    const errors = validateStateObject(doc, typeNode, value);

    assert.ok(errors.length > 0);
    const stateError = errors[0] as StateValidationError;
    assert.strictEqual(stateError.kind, "TYPE");
  });

  it("should handle state with all field types", () => {
    const sdl = `
      type TestState {
        id: ID!
        name: String!
        count: Int!
        price: Float!
        active: Boolean!
        status: Status!
        items: [String!]!
        optionalName: String
        optionalItems: [String]
      }

      enum Status {
        ACTIVE
        INACTIVE
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(
      result,
      JSON.stringify(
        {
          id: "placeholder-id",
          name: "",
          count: 0,
          price: 0,
          active: false,
          status: "ACTIVE",
          items: [],
          optionalName: null,
          optionalItems: null,
        },
        null,
        2,
      ),
    );
  });

  it("makeMinimalObjectForStateType should add missing fields to array items", () => {
    const sdl = `
      type TestState {
        items: [Item!]!
      }

      type Item {
        id: ID!
        name: String
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const existingValue = JSON.stringify(
      {
        items: [{ id: "1" }, { id: "2", name: "test" }],
      },
      null,
      2,
    );

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue,
    });

    // makeMinimalObjectForStateType preserves array items as-is
    assert.strictEqual(
      result,
      JSON.stringify(
        {
          items: [
            { id: "1", name: null },
            { id: "2", name: "test" },
          ],
        },
        null,
        2,
      ),
    );
  });

  it("validateStateObject should accept valid complex state", () => {
    const sdl = `
      type TestState {
        user: User!
        settings: Settings
      }

      type User {
        id: ID!
        name: String!
        email: String
      }

      type Settings {
        theme: String
        notifications: Boolean
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");
    const value = JSON.stringify({
      user: {
        id: "user-1",
        name: "John Doe",
        email: null,
      },
      settings: {
        theme: "dark",
        notifications: true,
      },
    });

    const errors = validateStateObject(doc, typeNode, value);

    assert.strictEqual(errors.length, 0);
  });

  it("should handle state with optional recursive field types", () => {
    const sdl = `
      type TestState {
        item: Item!
      }
        
      type Item {
        name: String!
        child: Item
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(
      result,
      JSON.stringify(
        {
          item: {
            name: "",
            child: null,
          },
        },
        null,
        2,
      ),
    );
  });

  it("should handle state with required recursive field types", () => {
    const sdl = `
      type TestState {
        item: Item!
      }

      type Item {
        name: String!
        child: Item!
      }
    `;
    const doc = parse(sdl);
    const typeNode = getStateTypeNode(sdl, "TestState");

    const result = makeMinimalObjectForStateType({
      sharedSchemaDocumentNode: doc,
      stateTypeDefinitionNode: typeNode,
      existingValue: JSON.stringify({}),
    });

    assert.strictEqual(
      result,
      JSON.stringify(
        {
          item: {
            name: "",
            child: null,
          },
        },
        null,
        2,
      ),
    );

    const errors = validateStateObject(doc, typeNode, result);
    assert.equal(errors.length, 1);
    const error = errors[0] as StateValidationError;
    assert.equal(error.kind, "RECURSIVE_TYPE");
    assert.equal(error.field, "item");
  });
});
