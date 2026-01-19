import type { IReactorClient, PagedResults } from "@powerhousedao/reactor";
import {
  documentModelDocumentModelModule,
  type Action,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as adapters from "../src/graphql/reactor/adapters.js";

const createTestDocument = (): PHDocument => {
  return documentModelDocumentModelModule.utils.createDocument();
};

describe("Reactor Adapters", () => {
  describe("fromInputMaybe", () => {
    it("should convert null to undefined", () => {
      expect(adapters.fromInputMaybe(null)).toBeUndefined();
    });

    it("should pass through undefined", () => {
      expect(adapters.fromInputMaybe(undefined)).toBeUndefined();
    });

    it("should pass through values", () => {
      expect(adapters.fromInputMaybe("test")).toBe("test");
      expect(adapters.fromInputMaybe(123)).toBe(123);
      expect(adapters.fromInputMaybe(true)).toBe(true);
      expect(adapters.fromInputMaybe({ key: "value" })).toEqual({
        key: "value",
      });
    });
  });

  describe("toMutableArray", () => {
    it("should convert readonly array to mutable array", () => {
      const readonly: readonly string[] = ["a", "b", "c"];
      const result = adapters.toMutableArray(readonly);

      expect(result).toEqual(["a", "b", "c"]);
      expect(Array.isArray(result)).toBe(true);
      // Verify it's a new array
      expect(result).not.toBe(readonly);
    });

    it("should return undefined for undefined input", () => {
      expect(adapters.toMutableArray(undefined)).toBeUndefined();
    });

    it("should handle empty arrays", () => {
      const readonly: readonly string[] = [];
      const result = adapters.toMutableArray(readonly);

      expect(result).toEqual([]);
    });
  });

  describe("jsonObjectToAction", () => {
    it("should convert valid JSONObject to Action", () => {
      const jsonObject = {
        type: "SET_NAME",
        scope: "global",
        input: { name: "Test" },
        id: "action-1",
        timestampUtcMs: "2024-01-01T00:00:00Z",
      };

      const result = adapters.jsonObjectToAction(jsonObject);

      expect(result).toEqual(jsonObject);
      expect(result.type).toBe("SET_NAME");
      expect(result.scope).toBe("global");
    });

    it("should reject null input", () => {
      expect(() => adapters.jsonObjectToAction(null)).toThrow(
        "Invalid action structure",
      );
    });

    it("should reject non-object input", () => {
      expect(() => adapters.jsonObjectToAction("string")).toThrow(
        "Invalid action structure",
      );
      expect(() => adapters.jsonObjectToAction(123)).toThrow(
        "Invalid action structure",
      );
    });

    it("should reject object without type field", () => {
      expect(() =>
        adapters.jsonObjectToAction({
          scope: "global",
          input: {},
        }),
      ).toThrow("Invalid action structure");
    });

    it("should reject object with non-string type", () => {
      expect(() =>
        adapters.jsonObjectToAction({
          type: 123,
          scope: "global",
          input: {},
        }),
      ).toThrow("Invalid action structure");
    });

    it("should reject object without scope field", () => {
      expect(() =>
        adapters.jsonObjectToAction({
          type: "SET_NAME",
          input: {},
        }),
      ).toThrow("Invalid action structure");
    });

    it("should reject object with non-string scope", () => {
      expect(() =>
        adapters.jsonObjectToAction({
          type: "SET_NAME",
          scope: 123,
          input: {},
        }),
      ).toThrow("Invalid action structure");
    });

    it("should reject object without input field", () => {
      expect(() =>
        adapters.jsonObjectToAction({
          type: "SET_NAME",
          scope: "global",
        }),
      ).toThrow("Invalid action structure");
    });

    it("should accept action with any input type", () => {
      const validInputs = [
        { input: null },
        { input: undefined },
        { input: 123 },
        { input: "string" },
        { input: { nested: "object" } },
        { input: ["array"] },
      ];

      validInputs.forEach((inputObj) => {
        const action = {
          type: "TEST",
          scope: "global",
          ...inputObj,
        };

        expect(() => adapters.jsonObjectToAction(action)).not.toThrow();
      });
    });
  });

  describe("validateDocumentModelAction", () => {
    it("should validate action against document model successfully", () => {
      const action = documentModelDocumentModelModule.actions.setModelName({
        name: "Test",
      });

      const result = adapters.validateDocumentModelAction(
        documentModelDocumentModelModule as unknown as DocumentModelModule,
        action,
      );

      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject action when model has no specifications", () => {
      const mockModule: DocumentModelModule = {
        documentModel: {
          global: {
            id: "test-model",
            name: "test/model",
            author: { name: "Test", website: null },
            description: "Test",
            extension: "test",
            specifications: [],
          },
          local: {},
        } as any,
        actions: {},
        reducer: vi.fn(),
        utils: {} as any,
      } as any;

      const action: Action = {
        type: "SET_NAME",
        scope: "global",
        input: {},
        id: "action-1",
        timestampUtcMs: "2024-01-01T00:00:00Z",
      };

      const result = adapters.validateDocumentModelAction(mockModule, action);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Document model has no specifications");
    });

    it("should reject action with unknown operation type", () => {
      const mockModule: DocumentModelModule = {
        documentModel: {
          global: {
            id: "test-model",
            name: "test/model",
            author: { name: "Test", website: null },
            description: "Test",
            extension: "test",
            specifications: [
              {
                version: "1.0.0",
                changeLog: [],
                modules: [
                  {
                    name: "test",
                    operations: [
                      {
                        name: "SET_NAME",
                        scope: "global",
                      } as any,
                    ],
                  } as any,
                ],
              } as any,
            ],
          },
          local: {},
        } as any,
        actions: {},
        reducer: vi.fn(),
        utils: {} as any,
      } as any;

      const action: Action = {
        type: "UNKNOWN_ACTION",
        scope: "global",
        input: {},
        id: "action-1",
        timestampUtcMs: "2024-01-01T00:00:00Z",
      };

      const result = adapters.validateDocumentModelAction(mockModule, action);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("UNKNOWN_ACTION"),
      );
      expect(result.errors).toContainEqual(
        expect.stringContaining("not defined in any module"),
      );
    });

    it("should reject action when action creator is missing", () => {
      const mockModule: DocumentModelModule = {
        documentModel: {
          global: {
            id: "test-model",
            name: "test/model",
            author: { name: "Test", website: null },
            description: "Test",
            extension: "test",
            specifications: [
              {
                version: "1.0.0",
                changeLog: [],
                modules: [
                  {
                    name: "test",
                    operations: [
                      {
                        name: "SET_NAME",
                        scope: "global",
                      } as any,
                    ],
                  } as any,
                ],
              } as any,
            ],
          },
          local: {},
        } as any,
        actions: {},
        reducer: vi.fn(),
        utils: {} as any,
      } as any;

      const action: Action = {
        type: "SET_NAME",
        scope: "global",
        input: {},
        id: "action-1",
        timestampUtcMs: "2024-01-01T00:00:00Z",
      };

      const result = adapters.validateDocumentModelAction(mockModule, action);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Action creator"),
      );
      expect(result.errors).toContainEqual(
        expect.stringContaining("not defined in document model module"),
      );
    });

    it("should reject action with invalid input", () => {
      const mockModule: DocumentModelModule = {
        documentModel: {
          global: {
            id: "test-model",
            name: "test/model",
            author: { name: "Test", website: null },
            description: "Test",
            extension: "test",
            specifications: [
              {
                version: "1.0.0",
                changeLog: [],
                modules: [
                  {
                    name: "test",
                    operations: [
                      {
                        name: "SET_NAME",
                        scope: "global",
                      } as any,
                    ],
                  } as any,
                ],
              } as any,
            ],
          },
          local: {},
        } as any,
        actions: {
          setName: vi.fn(() => {
            throw new Error("Invalid input: name is required");
          }),
        },
        reducer: vi.fn(),
        utils: {} as any,
      } as any;

      const action: Action = {
        type: "SET_NAME",
        scope: "global",
        input: {},
        id: "action-1",
        timestampUtcMs: "2024-01-01T00:00:00Z",
      };

      const result = adapters.validateDocumentModelAction(mockModule, action);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(
        expect.stringContaining("Input validation error"),
      );
      expect(result.errors).toContainEqual(
        expect.stringContaining("name is required"),
      );
    });

    it("should reject action with mismatched scope", () => {
      const mockModule: DocumentModelModule = {
        documentModel: {
          global: {
            id: "test-model",
            name: "test/model",
            author: { name: "Test", website: null },
            description: "Test",
            extension: "test",
            specifications: [
              {
                version: "1.0.0",
                changeLog: [],
                modules: [
                  {
                    name: "test",
                    operations: [
                      {
                        name: "SET_NAME",
                        scope: "global",
                      } as any,
                    ],
                  } as any,
                ],
              } as any,
            ],
          },
          local: {},
        } as any,
        actions: {
          setName: vi.fn((input: any) => ({
            type: "SET_NAME",
            scope: "global",
            input,
            id: "1",
            timestampUtcMs: "2024-01-01T00:00:00Z",
          })),
        },
        reducer: vi.fn(),
        utils: {} as any,
      } as any;

      const action: Action = {
        type: "SET_NAME",
        scope: "local",
        input: { name: "Test" },
        id: "action-1",
        timestampUtcMs: "2024-01-01T00:00:00Z",
      };

      const result = adapters.validateDocumentModelAction(mockModule, action);

      expect(result.isValid).toBe(false);
      expect(result.errors).toContainEqual(expect.stringContaining("scope"));
    });
  });

  describe("validateActions", () => {
    it("should validate multiple actions successfully", () => {
      const actions = [
        documentModelDocumentModelModule.actions.setModelName({
          name: "Name 1",
        }),
        documentModelDocumentModelModule.actions.setModelName({
          name: "Name 2",
        }),
      ];

      const result = adapters.validateActions(actions);

      expect(result).toHaveLength(2);
      expect(result[0].type).toBe("SET_MODEL_NAME");
      expect(result[1].type).toBe("SET_MODEL_NAME");
    });

    it("should reject when action structure is invalid", () => {
      const invalidActions = [{ invalidAction: true }];

      expect(() => adapters.validateActions(invalidActions)).toThrow(
        "Action at index 0",
      );
    });

    it("should convert valid action objects", () => {
      const actions = [
        {
          type: "SET_NAME",
          scope: "global",
          input: { name: "Test" },
          id: "action-1",
          timestampUtcMs: "2024-01-01T00:00:00Z",
        },
      ];

      const result = adapters.validateActions(actions);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe("SET_NAME");
      expect(result[0].scope).toBe("global");
    });
  });
});
