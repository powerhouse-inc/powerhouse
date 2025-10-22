import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentModelGlobalState } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppModuleGlobalState } from "../../../document-models/app-module/index.js";
import type { DocumentEditorState } from "../../../document-models/document-editor/index.js";
import type { ProcessorModuleState } from "../../../document-models/processor-module/index.js";
import type { SubgraphModuleState } from "../../../document-models/subgraph-module/index.js";
import type { VetraPackageState } from "../../../document-models/vetra-package/index.js";
import { CodegenProcessor } from "../index.js";

// Mock ONLY the external codegen library boundary
vi.mock("@powerhousedao/codegen", () => ({
  generateEditor: vi.fn(),
  generateFromDocument: vi.fn(),
  generateSubgraphFromDocumentModel: vi.fn(),
  generateManifest: vi.fn(),
  validateDocumentModelState: vi.fn(() => ({ isValid: true })),
  generateDriveEditor: vi.fn(),
  generateSubgraph: vi.fn(),
  generateProcessor: vi.fn(),
}));

// Mock config functions
vi.mock("@powerhousedao/config/node", () => ({
  getConfig: vi.fn(() => "/test/config/path"),
}));

// Mock kebabCase
vi.mock("change-case", () => ({
  kebabCase: vi.fn((str: string) => str.toLowerCase().replace(/\s+/g, "-")),
}));

// Mock logger
vi.mock("../logger.js", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CodegenProcessor E2E Tests", () => {
  let processor: CodegenProcessor;
  let mockConfig: { PH_CONFIG: string; CURRENT_WORKING_DIR: string };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Use fake timers to control setTimeout
    vi.useFakeTimers();

    mockConfig = {
      PH_CONFIG: "/test/config/path",
      // Use the actual working directory for consistency
      CURRENT_WORKING_DIR: process.cwd(),
    };

    // Create a REAL processor instance (not mocked)
    processor = new CodegenProcessor();

    // Reset all codegen function mocks to resolve successfully
    const codegen = await import("@powerhousedao/codegen");
    vi.mocked(codegen.generateEditor).mockResolvedValue(undefined as any);
    vi.mocked(codegen.generateFromDocument).mockResolvedValue(undefined as any);
    vi.mocked(codegen.generateSubgraphFromDocumentModel).mockResolvedValue(
      undefined as any,
    );
    vi.mocked(codegen.generateManifest).mockResolvedValue(undefined as any);
    vi.mocked(codegen.generateDriveEditor).mockResolvedValue(undefined as any);
    vi.mocked(codegen.generateSubgraph).mockResolvedValue(undefined as any);
    vi.mocked(codegen.generateProcessor).mockResolvedValue(undefined as any);
    vi.mocked(codegen.validateDocumentModelState).mockReturnValue({
      isValid: true,
    } as any);
  });

  afterEach(() => {
    // Restore timers
    vi.useRealTimers();
  });

  describe("Document Editor E2E", () => {
    it("should process valid document-editor strand and call generateEditor with correct arguments", async () => {
      const { generateEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const validState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
          { id: "dt-2", documentType: "powerhouse/budget-statement" },
        ],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      // Advance timers to trigger debounced generation
      await vi.runAllTimersAsync();

      expect(generateEditor).toHaveBeenCalledWith(
        "Test Editor",
        ["powerhouse/document-model", "powerhouse/budget-statement"],
        mockConfig.PH_CONFIG,
        "test-editor",
      );

      expect(generateManifest).toHaveBeenCalledWith(
        {
          editors: [
            {
              id: "test-editor",
              name: "Test Editor",
              documentTypes: [
                "powerhouse/document-model",
                "powerhouse/budget-statement",
              ],
            },
          ],
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });

    it("should not call codegen functions for invalid document-editor strand (missing name)", async () => {
      const { generateEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const invalidState: DocumentEditorState = {
        name: "",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not call codegen functions for invalid document-editor strand (DRAFT status)", async () => {
      const { generateEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const invalidState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "DRAFT",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not call codegen functions for invalid document-editor strand (empty documentTypes)", async () => {
      const { generateEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const invalidState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Document Model E2E", () => {
    it("should process valid document-model strand and call all three codegen functions", async () => {
      const {
        generateFromDocument,
        generateSubgraphFromDocumentModel,
        generateManifest,
      } = await import("@powerhousedao/codegen");

      const validState: DocumentModelGlobalState = {
        id: "test-model-id",
        name: "Test Model",
      } as DocumentModelGlobalState;

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-model",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateFromDocument).toHaveBeenCalledWith(
        validState,
        mockConfig.PH_CONFIG,
        { verbose: false },
      );

      expect(generateSubgraphFromDocumentModel).toHaveBeenCalledWith(
        "Test Model",
        validState,
        mockConfig.PH_CONFIG,
        { verbose: false },
      );

      expect(generateManifest).toHaveBeenCalledWith(
        {
          documentModels: [
            {
              id: "test-model-id",
              name: "Test Model",
            },
          ],
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });

    it("should not call codegen functions when validateDocumentModelState returns invalid", async () => {
      const {
        validateDocumentModelState,
        generateFromDocument,
        generateSubgraphFromDocumentModel,
        generateManifest,
      } = await import("@powerhousedao/codegen");

      vi.mocked(validateDocumentModelState).mockReturnValue({
        isValid: false,
        errors: ["Name is required"],
      } as any);

      const invalidState: DocumentModelGlobalState = {
        id: "test-model-id",
      } as DocumentModelGlobalState;

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-model",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateFromDocument).not.toHaveBeenCalled();
      expect(generateSubgraphFromDocumentModel).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not call subsequent codegen functions when generateFromDocument fails", async () => {
      const {
        generateFromDocument,
        generateSubgraphFromDocumentModel,
        generateManifest,
      } = await import("@powerhousedao/codegen");

      vi.mocked(generateFromDocument).mockRejectedValueOnce(
        new Error("Document generation failed"),
      );

      const validState: DocumentModelGlobalState = {
        id: "test-model-id",
        name: "Test Model",
      } as DocumentModelGlobalState;

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-model",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateFromDocument).toHaveBeenCalled();
      // Subsequent calls should not happen
      expect(generateSubgraphFromDocumentModel).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Processor E2E", () => {
    it("should process valid analytics processor strand and call generateProcessor", async () => {
      const { generateProcessor } = await import("@powerhousedao/codegen");

      const validState: ProcessorModuleState = {
        name: "Test Processor",
        type: "analytics",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
          { id: "dt-2", documentType: "powerhouse/budget-statement" },
        ],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).toHaveBeenCalledWith(
        "Test Processor",
        "analytics",
        ["powerhouse/document-model", "powerhouse/budget-statement"],
        mockConfig.PH_CONFIG,
      );
    });

    it("should map relational type to relationalDb when processing processor strand", async () => {
      const { generateProcessor } = await import("@powerhousedao/codegen");

      const validState: ProcessorModuleState = {
        name: "Test Processor",
        type: "relational",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).toHaveBeenCalledWith(
        "Test Processor",
        "relationalDb",
        ["powerhouse/document-model"],
        mockConfig.PH_CONFIG,
      );
    });

    it("should not call generateProcessor for unsupported processor type", async () => {
      const { generateProcessor } = await import("@powerhousedao/codegen");

      const invalidState: ProcessorModuleState = {
        name: "Test Processor",
        type: "unsupported" as any,
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).not.toHaveBeenCalled();
    });

    it("should not call generateProcessor for invalid processor strand (empty documentTypes)", async () => {
      const { generateProcessor } = await import("@powerhousedao/codegen");

      const invalidState: ProcessorModuleState = {
        name: "Test Processor",
        type: "analytics",
        documentTypes: [],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).not.toHaveBeenCalled();
    });
  });

  describe("App E2E", () => {
    it("should process valid app strand without dragAndDrop", async () => {
      const { generateDriveEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const validState: AppModuleGlobalState = {
        name: "Test App",
        status: "CONFIRMED",
        isDragAndDropEnabled: false,
        allowedDocumentTypes: [],
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/app",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateDriveEditor).toHaveBeenCalledWith({
        name: "Test App",
        config: mockConfig.PH_CONFIG,
        appId: "test-app",
        allowedDocumentTypes: "",
        isDragAndDropEnabled: false,
      });

      expect(generateManifest).toHaveBeenCalledWith(
        {
          apps: [
            {
              id: "test-app",
              name: "Test App",
              driveEditor: "test-app",
            },
          ],
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });

    it("should process valid app strand with dragAndDrop enabled", async () => {
      const { generateDriveEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const validState: AppModuleGlobalState = {
        name: "Test App",
        status: "CONFIRMED",
        isDragAndDropEnabled: true,
        allowedDocumentTypes: [
          "powerhouse/document-model",
          "powerhouse/budget-statement",
        ],
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/app",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateDriveEditor).toHaveBeenCalledWith({
        name: "Test App",
        config: mockConfig.PH_CONFIG,
        appId: "test-app",
        allowedDocumentTypes:
          "powerhouse/document-model,powerhouse/budget-statement",
        isDragAndDropEnabled: true,
      });

      expect(generateManifest).toHaveBeenCalled();
    });

    it("should not call codegen functions for invalid app strand (DRAFT status)", async () => {
      const { generateDriveEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const invalidState: AppModuleGlobalState = {
        name: "Test App",
        status: "DRAFT",
        isDragAndDropEnabled: false,
        allowedDocumentTypes: [],
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/app",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateDriveEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Subgraph E2E", () => {
    it("should process valid subgraph strand and call generateSubgraph with null", async () => {
      const { generateSubgraph, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const validState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/subgraph",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateSubgraph).toHaveBeenCalledWith(
        "Test Subgraph",
        null,
        mockConfig.PH_CONFIG,
      );

      expect(generateManifest).toHaveBeenCalledWith(
        {
          subgraphs: [
            {
              id: "test-subgraph",
              name: "Test Subgraph",
              documentTypes: [],
            },
          ],
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });

    it("should not call codegen functions for invalid subgraph strand (DRAFT status)", async () => {
      const { generateSubgraph, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const invalidState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "DRAFT",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/subgraph",
        state: invalidState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateSubgraph).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Package E2E", () => {
    it("should process valid package strand and call generateManifest", async () => {
      const { generateManifest } = await import("@powerhousedao/codegen");

      const validState = {
        name: "Test Package",
        category: "utility",
        description: "A test package",
        author: {
          name: "Test Author",
          website: "https://example.com",
        },
      } as VetraPackageState;

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/package",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateManifest).toHaveBeenCalledWith(
        {
          name: "Test Package",
          category: "utility",
          description: "A test package",
          publisher: {
            name: "Test Author",
            url: "https://example.com",
          },
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });

    it("should process package strand with missing optional fields", async () => {
      const { generateManifest } = await import("@powerhousedao/codegen");

      const stateWithoutAuthor = {
        name: "Test Package",
        category: "utility",
        description: "A test package",
      } as VetraPackageState;

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/package",
        state: stateWithoutAuthor,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateManifest).toHaveBeenCalledWith(
        {
          name: "Test Package",
          category: "utility",
          description: "A test package",
          publisher: {
            name: "",
            url: "",
          },
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });
  });

  describe("Multi-Strand E2E", () => {
    it("should process multiple valid strands of different types in one batch", async () => {
      const { generateEditor, generateSubgraph, generateManifest } =
        await import("@powerhousedao/codegen");

      const editorState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const subgraphState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "CONFIRMED",
      };

      const strands: InternalTransmitterUpdate[] = [
        {
          documentId: "test-doc-1",
          documentType: "powerhouse/document-editor",
          state: editorState,
        } as any,
        {
          documentId: "test-doc-2",
          documentType: "powerhouse/subgraph",
          state: subgraphState,
        } as any,
      ];

      await processor.onStrands(strands);
      await vi.runAllTimersAsync();

      expect(generateEditor).toHaveBeenCalledWith(
        "Test Editor",
        ["powerhouse/document-model"],
        mockConfig.PH_CONFIG,
        "test-editor",
      );

      expect(generateSubgraph).toHaveBeenCalledWith(
        "Test Subgraph",
        null,
        mockConfig.PH_CONFIG,
      );

      // generateManifest should be called twice (once for each strand)
      expect(generateManifest).toHaveBeenCalledTimes(2);
    });

    it("should process valid strands and skip invalid strands in the same batch", async () => {
      const { generateEditor, generateSubgraph } = await import(
        "@powerhousedao/codegen"
      );

      const validEditorState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const invalidSubgraphState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "DRAFT", // Invalid - should be skipped
      };

      const strands: InternalTransmitterUpdate[] = [
        {
          documentId: "test-doc-1",
          documentType: "powerhouse/document-editor",
          state: validEditorState,
        } as any,
        {
          documentId: "test-doc-2",
          documentType: "powerhouse/subgraph",
          state: invalidSubgraphState,
        } as any,
      ];

      await processor.onStrands(strands);
      await vi.runAllTimersAsync();

      // Valid strand should be processed
      expect(generateEditor).toHaveBeenCalledWith(
        "Test Editor",
        ["powerhouse/document-model"],
        mockConfig.PH_CONFIG,
        "test-editor",
      );

      // Invalid strand should NOT be processed
      expect(generateSubgraph).not.toHaveBeenCalled();
    });

    it("should not process any strands when all are invalid", async () => {
      const { generateEditor, generateSubgraph, generateManifest } =
        await import("@powerhousedao/codegen");

      const invalidEditorState: DocumentEditorState = {
        name: "", // Invalid - missing name
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const invalidSubgraphState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "DRAFT", // Invalid - draft status
      };

      const strands: InternalTransmitterUpdate[] = [
        {
          documentId: "test-doc-1",
          documentType: "powerhouse/document-editor",
          state: invalidEditorState,
        } as any,
        {
          documentId: "test-doc-2",
          documentType: "powerhouse/subgraph",
          state: invalidSubgraphState,
        } as any,
      ];

      await processor.onStrands(strands);
      await vi.runAllTimersAsync();

      // No strands should be processed
      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateSubgraph).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Edge Cases E2E", () => {
    it("should not process strand with unsupported document type", async () => {
      const { generateEditor, generateProcessor, generateManifest } =
        await import("@powerhousedao/codegen");

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "unsupported/document-type",
        state: { name: "Test" },
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      // No codegen functions should be called for unsupported types
      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateProcessor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not process strand with missing documentId", async () => {
      const { generateEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const validState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const strand: InternalTransmitterUpdate = {
        documentId: "",
        documentType: "powerhouse/document-editor",
        state: validState,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      // Should not process strand with empty documentId
      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not process strand with missing state", async () => {
      const { generateEditor, generateManifest } = await import(
        "@powerhousedao/codegen"
      );

      const strand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: undefined,
      } as any;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      // Should not process strand with undefined state
      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should debounce generate calls for same strand", async () => {
      const { generateManifest } = await import("@powerhousedao/codegen");

      const firstState = {
        name: "Test Package",
        category: "utility",
        description: "A test package",
        author: {
          name: "Test Author",
          website: "https://example.com",
        },
      } as VetraPackageState;

      const secondState = {
        ...firstState,
        name: "Test Package 2",
      };

      const firstStrand: InternalTransmitterUpdate = {
        documentId: "test-doc-1",
        documentType: "powerhouse/package",
        state: firstState,
      } as any;

      const secondStrand = {
        ...firstStrand,
        state: secondState,
      };

      await processor.onStrands([firstStrand]);
      await processor.onStrands([secondStrand]);

      await vi.runAllTimersAsync();

      expect(generateManifest).toHaveBeenCalledExactlyOnceWith(
        {
          name: "Test Package 2",
          category: "utility",
          description: "A test package",
          publisher: {
            name: "Test Author",
            url: "https://example.com",
          },
        },
        mockConfig.CURRENT_WORKING_DIR,
      );
    });
  });
});
