import { describe, expect, it, beforeEach } from "vitest";
import { Project } from "ts-morph";
import { ReducerGenerator } from "../file-generators/ReducerGenerator.js";
import { ImportManager } from "../utilities/ImportManager.js";
import { DirectoryManager } from "../utilities/DirectoryManager.js";
import { type GenerationContext, type Actions } from "../core/GenerationContext.js";

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

  getReducerPath(rootDir: string, docModelName: string, moduleName: string): string {
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
      const actions: Actions[] = [
        {
          name: "SET_TEST_VALUE",
          hasInput: true,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
        {
          name: "DELETE_ITEM",
          hasInput: false,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        actions,
      };

      await generator.generate(context);

      // Get the generated file
      const expectedPath = "/test/document-model/test-doc/src/reducers/test-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      
      expect(sourceFile).toBeDefined();
      
      const content = sourceFile!.getFullText();
      
      // Check type import
      expect(content).toContain('import type { TestDocTestModuleOperations } from "../../gen/test-module/operations.js";');
      
      // Check reducer variable declaration
      expect(content).toContain("export const reducer: TestDocTestModuleOperations = {");
      
      // Check generated methods
      expect(content).toContain("setTestValueOperation(state, action, dispatch) {");
      expect(content).toContain('// TODO: Implement "setTestValueOperation" reducer');
      expect(content).toContain('throw new Error(\'Reducer "setTestValueOperation" not yet implemented\');');
      
      expect(content).toContain("deleteItemOperation(state, action, dispatch) {");
      expect(content).toContain('// TODO: Implement "deleteItemOperation" reducer');
      expect(content).toContain('throw new Error(\'Reducer "deleteItemOperation" not yet implemented\');');
    });

    it("should handle existing reducer file and add new methods", async () => {
      // First, create a file with one method
      const initialActions: Actions[] = [
        {
          name: "SET_VALUE",
          hasInput: true,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "MyDoc" } as any,
        module: { name: "myModule" } as any,
        project,
        actions: initialActions,
      };

      await generator.generate(context);

      // Now add more actions
      const newActions: Actions[] = [
        ...initialActions,
        {
          name: "DELETE_VALUE",
          hasInput: false,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
      ];

      const updatedContext: GenerationContext = {
        ...context,
        actions: newActions,
      };

      await generator.generate(updatedContext);

      const expectedPath = "/test/document-model/my-doc/src/reducers/my-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Should have both methods
      expect(content).toContain("setValueOperation(state, action, dispatch) {");
      expect(content).toContain("deleteValueOperation(state, action, dispatch) {");
      
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
        actions: [
          {
            name: "SET_VALUE",
            hasInput: true,
            hasAttachment: false,
            scope: "global",
            state: "",
          },
        ],
      };

      // Generate first time
      await generator.generate(context);
      
      const filePath = "/test/document-model/test-doc/src/reducers/first-module.ts";
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

    it("should skip generation when no actions provided", async () => {
      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "emptyModule" } as any,
        project,
        actions: [], // No actions
      };

      await generator.generate(context);

      // Should not create any files
      const expectedPath = "/test/document-model/test-doc/src/reducers/empty-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      
      expect(sourceFile).toBeUndefined();
    });

    it("should handle special characters and case conversion correctly", async () => {
      const actions: Actions[] = [
        {
          name: "SET_SPECIAL_VALUE",
          hasInput: true,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "test_doc_name" } as any,
        module: { name: "test_module_name" } as any,
        project,
        actions,
      };

      await generator.generate(context);

      const expectedPath = "/test/document-model/test-doc-name/src/reducers/test-module-name.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Check PascalCase type name
      expect(content).toContain("TestDocNameTestModuleNameOperations");
      
      // Check param-case import path
      expect(content).toContain("../../gen/test-module-name/operations.js");
      
      // Check camelCase method name
      expect(content).toContain("setSpecialValueOperation(state, action, dispatch)");
    });

    it("should skip actions with null or empty names", async () => {
      const actions: Actions[] = [
        {
          name: "VALID_ACTION",
          hasInput: true,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
        {
          name: null, // Should be skipped
          hasInput: false,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
        {
          name: "", // Should be skipped
          hasInput: false,
          hasAttachment: false,
          scope: "global",
          state: "",
        },
      ];

      const context: GenerationContext = {
        rootDir: "/test",
        docModel: { name: "TestDoc" } as any,
        module: { name: "testModule" } as any,
        project,
        actions,
      };

      await generator.generate(context);

      const expectedPath = "/test/document-model/test-doc/src/reducers/test-module.ts";
      const sourceFile = project.getSourceFile(expectedPath);
      const content = sourceFile!.getFullText();

      // Should only have the valid action method
      expect(content).toContain("validActionOperation(state, action, dispatch)");
      
      // Should not have methods for null/empty names
      const methodMatches = content.match(/Operation\(state, action, dispatch\)/g);
      expect(methodMatches).toHaveLength(1); // Only one method
    });
  });
});