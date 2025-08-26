import { Project } from "ts-morph";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type GenerationContext,
  type Operation,
} from "../core/GenerationContext.js";
import { ReducerGenerator } from "../file-generators/ReducerGenerator.js";
import { DirectoryManager } from "../utilities/DirectoryManager.js";
import { ImportManager } from "../utilities/ImportManager.js";

// Custom DirectoryManager for testing that works with in-memory file system
class TestDirectoryManager extends DirectoryManager {
  async ensureExists(dirPath: string): Promise<void> {
    // Skip directory creation for in-memory file system
  }

  async createSourceFile(project: Project, filePath: string) {
    // Check if file already exists and return it, otherwise create new one
    const existing = project.getSourceFile(filePath);
    if (existing) {
      return existing;
    }
    return project.createSourceFile(filePath);
  }

  getReducerPath(
    rootDir: string,
    docModelName: string,
    moduleName: string,
  ): string {
    // Use the same logic as the real DirectoryManager
    return super.getReducerPath(rootDir, docModelName, moduleName);
  }
}

describe("ReducerGenerator Integration", () => {
  let generator: ReducerGenerator;
  let project: Project;
  let importManager: ImportManager;
  let directoryManager: TestDirectoryManager;

  beforeEach(() => {
    // Use real instances with in-memory file system
    project = new Project({ useInMemoryFileSystem: true });
    importManager = new ImportManager();
    directoryManager = new TestDirectoryManager();
    generator = new ReducerGenerator(importManager, directoryManager);
  });

  describe("generate", () => {
    it("should create a complete reducer file with proper AST structure", async () => {
      const operations: Operation[] = [
        {
          id: "1",
          name: "SET_TEST_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
        {
          id: "2",
          name: "DELETE_ITEM",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: false,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        operations,
        forceUpdate: false,
      };

      await generator.generate(context);

      // Get the generated file
      const expectedPath =
        "/test/document-model/test-doc/src/reducers/test-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);

      expect(sourceFile).toBeDefined();

      const content = sourceFile!.getFullText();

      // Check type import
      expect(content).toContain(
        'import type { TestDocTestModuleOperations } from "../../gen/test-module/operations.js";',
      );

      // Check reducer variable declaration
      expect(content).toContain(
        "export const reducer: TestDocTestModuleOperations = {",
      );

      // Check generated methods
      expect(content).toContain(
        "setTestValueOperation(state, action, dispatch) {",
      );
      expect(content).toContain(
        '// TODO: Implement "setTestValueOperation" reducer',
      );
      expect(content).toContain(
        "throw new Error('Reducer \"setTestValueOperation\" not yet implemented');",
      );

      expect(content).toContain(
        "deleteItemOperation(state, action, dispatch) {",
      );
      expect(content).toContain(
        '// TODO: Implement "deleteItemOperation" reducer',
      );
      expect(content).toContain(
        "throw new Error('Reducer \"deleteItemOperation\" not yet implemented');",
      );
    });

    it("should handle existing reducer file and add new methods", async () => {
      // First, create a file with one method
      const initialOperations: Operation[] = [
        {
          id: "1",
          name: "SET_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "MyDoc" } as any,
        module: { name: "myModule" } as any,
        project,
        operations: initialOperations,
        forceUpdate: false,
      };

      await generator.generate(context);

      // Now add more operations
      const newOperations: Operation[] = [
        ...initialOperations,
        {
          id: "2",
          name: "DELETE_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: false,
          hasAttachment: false,
          state: "",
        },
      ];

      const updatedContext: GenerationContext = {
        ...context,
        operations: newOperations,
      };

      await generator.generate(updatedContext);

      const expectedPath =
        "/test/document-model/my-doc/src/reducers/my-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Should have both methods
      expect(content).toContain("setValueOperation(state, action, dispatch) {");
      expect(content).toContain(
        "deleteValueOperation(state, action, dispatch) {",
      );

      // Should only have one import and one reducer declaration
      const importMatches = content.match(/import type/g);
      expect(importMatches).toHaveLength(1);

      const reducerMatches = content.match(/export const reducer/g);
      expect(reducerMatches).toHaveLength(1);
    });

    it("should update existing reducer type when different", async () => {
      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "firstModule" } as any,
        project,
        operations: [
          {
            id: "1",
            name: "SET_VALUE",
            description: null,
            errors: [],
            examples: [],
            reducer: null,
            schema: null,
            template: null,
            scope: "global",
            hasInput: true,
            hasAttachment: false,
            state: "",
          },
        ],
        forceUpdate: false,
      };

      // Generate first time
      await generator.generate(context);

      const filePath =
        "/test/document-model/test-doc/src/reducers/first-module.ts";
      let sourceFile = project.getSourceFile(filePath);
      let content = sourceFile!.getFullText();

      expect(content).toContain("TestDocFirstModuleOperations");

      // Manually change the reducer variable type to simulate an outdated file
      const reducerVar = sourceFile!.getVariableDeclaration("reducer");
      reducerVar!.setType("OldTestDocOperations");

      // Generate again - should update the type
      await generator.generate(context);

      sourceFile = project.getSourceFile(filePath);
      content = sourceFile!.getFullText();

      // Should have the correct type now
      expect(content).toContain("TestDocFirstModuleOperations");
      expect(content).not.toContain("OldTestDocOperations");
    });

    it("should skip generation when no operations provided", async () => {
      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "emptyModule" } as any,
        project,
        operations: [], // No operations
        forceUpdate: false,
      };

      await generator.generate(context);

      // Should not create any files
      const expectedPath =
        "/test/document-model/test-doc/src/reducers/empty-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);

      expect(sourceFile).toBeUndefined();
    });

    it("should handle special characters and case conversion correctly", async () => {
      const operations: Operation[] = [
        {
          id: "1",
          name: "SET_SPECIAL_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "test_doc_name" } as any,
        module: { name: "test_module_name" } as any,
        project,
        operations,
        forceUpdate: false,
      };

      await generator.generate(context);

      const expectedPath =
        "/test/document-model/test-doc-name/src/reducers/test-module-name.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Check PascalCase type name
      expect(content).toContain("TestDocNameTestModuleNameOperations");

      // Check param-case import path
      expect(content).toContain("../../gen/test-module-name/operations.js");

      // Check camelCase method name
      expect(content).toContain(
        "setSpecialValueOperation(state, action, dispatch)",
      );
    });

    it("should skip operations with null or empty names", async () => {
      const operations: Operation[] = [
        {
          id: "1",
          name: "VALID_ACTION",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
        {
          id: "2",
          name: null, // Should be skipped
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: false,
          hasAttachment: false,
          state: "",
        },
        {
          id: "3",
          name: "", // Should be skipped
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: false,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        operations,
        forceUpdate: false,
      };

      await generator.generate(context);

      const expectedPath =
        "/test/document-model/test-doc/src/reducers/test-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Should only have the valid operation method
      expect(content).toContain(
        "validActionOperation(state, action, dispatch)",
      );

      // Should not have methods for null/empty names
      const methodMatches = content.match(
        /Operation\(state, action, dispatch\)/g,
      );
      expect(methodMatches).toHaveLength(1); // Only one method
    });

    it("should generate custom reducer code when provided", async () => {
      const operations: Operation[] = [
        {
          id: "1",
          name: "SET_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: "state.value = action.input.value;\nreturn state;",
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        operations,
        forceUpdate: false,
      };

      await generator.generate(context);

      const expectedPath =
        "/test/document-model/test-doc/src/reducers/test-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Should contain custom reducer code instead of TODO
      expect(content).toContain("state.value = action.input.value;");
      expect(content).toContain("return state;");
      expect(content).not.toContain(
        '// TODO: Implement "setValueOperation" reducer',
      );
      expect(content).not.toContain("throw new Error");
    });

    it("should update existing reducer when forceUpdate is true", async () => {
      // First, create a reducer with default implementation
      const initialOperations: Operation[] = [
        {
          id: "1",
          name: "SET_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        operations: initialOperations,
        forceUpdate: false,
      };

      await generator.generate(context);

      const expectedPath =
        "/test/document-model/test-doc/src/reducers/test-module.ts";
      let sourceFile = project.getSourceFile(expectedPath);
      let content = sourceFile!.getFullText();

      // Should have default TODO implementation
      expect(content).toContain(
        '// TODO: Implement "setValueOperation" reducer',
      );

      // Now update with custom reducer code and forceUpdate = true
      const updatedOperations: Operation[] = [
        {
          id: "1",
          name: "SET_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: "state.customValue = action.input.value;\nreturn state;",
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const updatedContext: GenerationContext = {
        ...context,
        operations: updatedOperations,
        forceUpdate: true,
      };

      await generator.generate(updatedContext);

      sourceFile = project.getSourceFile(expectedPath);
      content = sourceFile!.getFullText();

      // Should now have custom implementation
      expect(content).toContain("state.customValue = action.input.value;");
      expect(content).not.toContain(
        '// TODO: Implement "setValueOperation" reducer',
      );
    });

    it("should not update existing reducer when forceUpdate is false", async () => {
      // First, create a reducer with default implementation
      const initialOperations: Operation[] = [
        {
          id: "1",
          name: "SET_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: null,
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        operations: initialOperations,
        forceUpdate: false,
      };

      await generator.generate(context);

      // Now try to update with custom reducer code but forceUpdate = false
      const updatedOperations: Operation[] = [
        {
          id: "1",
          name: "SET_VALUE",
          description: null,
          errors: [],
          examples: [],
          reducer: "state.customValue = action.input.value;\nreturn state;",
          schema: null,
          template: null,
          scope: "global",
          hasInput: true,
          hasAttachment: false,
          state: "",
        },
      ];

      const updatedContext: GenerationContext = {
        ...context,
        operations: updatedOperations,
        forceUpdate: false,
      };

      await generator.generate(updatedContext);

      const expectedPath =
        "/test/document-model/test-doc/src/reducers/test-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Should still have original TODO implementation
      expect(content).toContain(
        '// TODO: Implement "setValueOperation" reducer',
      );
      expect(content).not.toContain("state.customValue = action.input.value;");
    });
  });
});
