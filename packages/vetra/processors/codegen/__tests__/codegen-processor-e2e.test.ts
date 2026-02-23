import type {
  PowerhouseConfig,
  PowerhouseManifest,
} from "@powerhousedao/config";
import type { InternalTransmitterUpdate } from "document-drive";
import type { DocumentModelGlobalState } from "document-model";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppModuleGlobalState } from "../../../document-models/app-module/index.js";
import type { DocumentEditorState } from "../../../document-models/document-editor/index.js";
import type { ProcessorModuleState } from "../../../document-models/processor-module/index.js";
import type { SubgraphModuleState } from "../../../document-models/subgraph-module/index.js";
import type { VetraPackageState } from "../../../document-models/vetra-package/index.js";
import {
  USE_TS_MORPH,
  USE_VERSIONING,
} from "../document-handlers/generators/constants.js";
import { CodegenProcessorLegacy } from "../index.legacy.js";

const defaultManifest: PowerhouseManifest = {
  name: "",
  description: "",
  category: "",
  publisher: {
    name: "",
    url: "",
  },
  documentModels: [],
  editors: [],
  apps: [],
  subgraphs: [],
  importScripts: [],
};

function mockGetPHConfig(): PowerhouseConfig {
  return {
    logLevel: "verbose",
    skipFormat: true,
    documentModelsDir: path.join(process.cwd(), "document-models"),
    editorsDir: path.join(process.cwd(), "editors"),
    processorsDir: path.join(process.cwd(), "processors"),
    subgraphsDir: path.join(process.cwd(), "subgraphs"),
    importScriptsDir: path.join(process.cwd(), "import-scripts"),
  };
}

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
  getConfig: vi.fn(mockGetPHConfig),
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

describe("CodegenProcessorLegacy E2E Tests", () => {
  let processor: CodegenProcessorLegacy;
  let mockConfig: { PH_CONFIG: PowerhouseConfig; CURRENT_WORKING_DIR: string };

  beforeEach(async () => {
    vi.clearAllMocks();
    // Use fake timers to control setTimeout
    vi.useFakeTimers();

    mockConfig = {
      PH_CONFIG: mockGetPHConfig(),
      // Use the actual working directory for consistency
      CURRENT_WORKING_DIR: process.cwd(),
    };

    // Create a REAL processor instance (not mocked)
    processor = new CodegenProcessorLegacy();

    // Reset all codegen function mocks to resolve successfully
    const codegen = await import("@powerhousedao/codegen");
    vi.mocked(codegen.generateEditor).mockResolvedValue();
    vi.mocked(codegen.generateFromDocument).mockResolvedValue();
    vi.mocked(codegen.generateSubgraphFromDocumentModel).mockResolvedValue();
    vi.mocked(codegen.generateManifest).mockResolvedValue(
      JSON.stringify(defaultManifest),
    );
    vi.mocked(codegen.generateDriveEditor).mockResolvedValue();
    vi.mocked(codegen.generateSubgraph).mockResolvedValue();
    vi.mocked(codegen.generateProcessor).mockResolvedValue();
    vi.mocked(codegen.validateDocumentModelState).mockReturnValue({
      isValid: true,
      errors: [],
    });
  });

  afterEach(() => {
    // Restore timers
    vi.useRealTimers();
  });

  describe("Document Editor E2E", () => {
    it("should process valid document-editor strand and call generateEditor with correct arguments", async () => {
      const { generateEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const validState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
          { id: "dt-2", documentType: "powerhouse/budget-statement" },
        ],
        status: "CONFIRMED",
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: validState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      // Advance timers to trigger debounced generation
      await vi.runAllTimersAsync();

      const generateEditorArgs: Parameters<typeof generateEditor> = [
        {
          ...mockConfig.PH_CONFIG,
          editorName: "Test Editor",
          documentTypes: [
            "powerhouse/document-model",
            "powerhouse/budget-statement",
          ],
          editorId: "test-editor",
          useTsMorph: USE_TS_MORPH,
        },
      ];
      expect(generateEditor).toHaveBeenCalledWith(...generateEditorArgs);

      const generateManifestArgs: Parameters<typeof generateManifest> = [
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
      ];

      expect(generateManifest).toHaveBeenCalledWith(...generateManifestArgs);
    });

    it("should not call codegen functions for invalid document-editor strand (missing name)", async () => {
      const { generateEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const invalidState: DocumentEditorState = {
        name: "",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: invalidState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not call codegen functions for invalid document-editor strand (DRAFT status)", async () => {
      const { generateEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const invalidState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "DRAFT",
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: invalidState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not call codegen functions for invalid document-editor strand (empty documentTypes)", async () => {
      const { generateEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const invalidState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [],
        status: "CONFIRMED",
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: invalidState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Document Model E2E", () => {
    it("should process valid document-model strand and call model and manifest codegen functions", async () => {
      const { generateFromDocument, generateManifest } =
        await import("@powerhousedao/codegen");

      const validState = {
        id: "test-model-id",
        name: "Test Model",
      } as DocumentModelGlobalState;

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-model",
        state: { global: validState },
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();
      const generateFromDocumentArgs: Parameters<typeof generateFromDocument> =
        [
          {
            useTsMorph: USE_TS_MORPH,
            useVersioning: USE_VERSIONING,
            documentModelState: validState,
            config: mockConfig.PH_CONFIG,
          },
        ];

      expect(generateFromDocument).toHaveBeenCalledWith(
        ...generateFromDocumentArgs,
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
      });

      const invalidState = {
        id: "test-model-id",
      } as DocumentModelGlobalState;

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-model",
        state: { global: invalidState },
      } as InternalTransmitterUpdate;

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
        author: {
          name: "test",
          website: "https://test.com",
        },
        description: "",
        extension: ".phd",
        specifications: [],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-model",
        state: { global: validState },
      } as InternalTransmitterUpdate;

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
        processorApps: ["connect"],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: validState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).toHaveBeenCalledWith<
        Parameters<typeof generateProcessor>
      >({
        processorName: "Test Processor",
        processorType: "analytics",
        documentTypes: [
          "powerhouse/document-model",
          "powerhouse/budget-statement",
        ],
        skipFormat: mockConfig.PH_CONFIG.skipFormat,
        processorApps: ["connect"],
        useTsMorph: USE_TS_MORPH,
      });
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
        processorApps: ["switchboard"],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: validState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).toHaveBeenCalledWith<
        Parameters<typeof generateProcessor>
      >({
        processorName: "Test Processor",
        processorType: "relationalDb",
        documentTypes: ["powerhouse/document-model"],
        skipFormat: mockConfig.PH_CONFIG.skipFormat,
        useTsMorph: USE_TS_MORPH,
        processorApps: ["switchboard"],
      });
    });

    it("should not call generateProcessor for unsupported processor type", async () => {
      const { generateProcessor } = await import("@powerhousedao/codegen");

      const invalidState: ProcessorModuleState = {
        name: "Test Processor",
        type: "unsupported",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
        processorApps: ["connect"],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: invalidState,
      } as InternalTransmitterUpdate;

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
        processorApps: ["connect"],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/processor",
        state: invalidState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateProcessor).not.toHaveBeenCalled();
    });
  });

  describe("App E2E", () => {
    it("should process valid app strand without dragAndDrop", async () => {
      const { generateDriveEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const validState: AppModuleGlobalState = {
        name: "Test App",
        status: "CONFIRMED",
        isDragAndDropEnabled: false,
        allowedDocumentTypes: [],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/app",
        state: validState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      const generateDriveEditorArgs: Parameters<typeof generateDriveEditor> = [
        {
          driveEditorName: "Test App",
          ...mockConfig.PH_CONFIG,
          driveEditorId: "test-app",
          allowedDocumentTypes: [],
          isDragAndDropEnabled: false,
          useTsMorph: USE_TS_MORPH,
        },
      ];

      expect(generateDriveEditor).toHaveBeenCalledWith(
        ...generateDriveEditorArgs,
      );

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
      const { generateDriveEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const validState: AppModuleGlobalState = {
        name: "Test App",
        status: "CONFIRMED",
        isDragAndDropEnabled: true,
        allowedDocumentTypes: [
          "powerhouse/document-model",
          "powerhouse/budget-statement",
        ],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/app",
        state: validState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateDriveEditor).toHaveBeenCalledWith({
        driveEditorName: "Test App",
        ...mockConfig.PH_CONFIG,
        driveEditorId: "test-app",
        allowedDocumentTypes: [
          "powerhouse/document-model",
          "powerhouse/budget-statement",
        ],
        isDragAndDropEnabled: true,
        useTsMorph: USE_TS_MORPH,
      });

      expect(generateManifest).toHaveBeenCalled();
    });

    it("should not call codegen functions for invalid app strand (DRAFT status)", async () => {
      const { generateDriveEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const invalidState: AppModuleGlobalState = {
        name: "Test App",
        status: "DRAFT",
        isDragAndDropEnabled: false,
        allowedDocumentTypes: [],
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/app",
        state: invalidState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      expect(generateDriveEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });
  });

  describe("Subgraph E2E", () => {
    it("should process valid subgraph strand and call generateSubgraph with null", async () => {
      const { generateSubgraph, generateManifest } =
        await import("@powerhousedao/codegen");

      const validState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "CONFIRMED",
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/subgraph",
        state: validState,
      } as InternalTransmitterUpdate;

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
      const { generateSubgraph, generateManifest } =
        await import("@powerhousedao/codegen");

      const invalidState: SubgraphModuleState = {
        name: "Test Subgraph",
        status: "DRAFT",
      };

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/subgraph",
        state: invalidState,
      } as InternalTransmitterUpdate;

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

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/package",
        state: validState,
      } as InternalTransmitterUpdate;

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

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/package",
        state: stateWithoutAuthor,
      } as InternalTransmitterUpdate;

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

      const strands = [
        {
          documentId: "test-doc-1",
          documentType: "powerhouse/document-editor",
          state: editorState,
        } as InternalTransmitterUpdate,
        {
          documentId: "test-doc-2",
          documentType: "powerhouse/subgraph",
          state: subgraphState,
        } as InternalTransmitterUpdate,
      ];

      await processor.onStrands(strands);
      await vi.runAllTimersAsync();

      expect(generateEditor).toHaveBeenCalledWith({
        editorName: "Test Editor",
        documentTypes: ["powerhouse/document-model"],
        ...mockConfig.PH_CONFIG,
        editorId: "test-editor",
        useTsMorph: USE_TS_MORPH,
      });

      expect(generateSubgraph).toHaveBeenCalledWith(
        "Test Subgraph",
        null,
        mockConfig.PH_CONFIG,
      );

      // generateManifest should be called twice (once for each strand)
      expect(generateManifest).toHaveBeenCalledTimes(2);
    });

    it("should process valid strands and skip invalid strands in the same batch", async () => {
      const { generateEditor, generateSubgraph } =
        await import("@powerhousedao/codegen");

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

      const strands = [
        {
          documentId: "test-doc-1",
          documentType: "powerhouse/document-editor",
          state: validEditorState,
        } as InternalTransmitterUpdate,
        {
          documentId: "test-doc-2",
          documentType: "powerhouse/subgraph",
          state: invalidSubgraphState,
        } as InternalTransmitterUpdate,
      ];

      await processor.onStrands(strands);
      await vi.runAllTimersAsync();

      // Valid strand should be processed
      expect(generateEditor).toHaveBeenCalledWith({
        editorName: "Test Editor",
        documentTypes: ["powerhouse/document-model"],
        ...mockConfig.PH_CONFIG,
        editorId: "test-editor",
        useTsMorph: USE_TS_MORPH,
      });

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

      const strands = [
        {
          documentId: "test-doc-1",
          documentType: "powerhouse/document-editor",
          state: invalidEditorState,
        } as InternalTransmitterUpdate,
        {
          documentId: "test-doc-2",
          documentType: "powerhouse/subgraph",
          state: invalidSubgraphState,
        } as InternalTransmitterUpdate,
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

      const strand = {
        documentId: "test-doc-1",
        documentType: "unsupported/document-type",
        state: { name: "Test" },
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      // No codegen functions should be called for unsupported types
      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateProcessor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not process strand with missing documentId", async () => {
      const { generateEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const validState: DocumentEditorState = {
        name: "Test Editor",
        documentTypes: [
          { id: "dt-1", documentType: "powerhouse/document-model" },
        ],
        status: "CONFIRMED",
      };

      const strand = {
        documentId: "",
        documentType: "powerhouse/document-editor",
        state: validState,
      } as InternalTransmitterUpdate;

      await processor.onStrands([strand]);
      await vi.runAllTimersAsync();

      // Should not process strand with empty documentId
      expect(generateEditor).not.toHaveBeenCalled();
      expect(generateManifest).not.toHaveBeenCalled();
    });

    it("should not process strand with missing state", async () => {
      const { generateEditor, generateManifest } =
        await import("@powerhousedao/codegen");

      const strand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/document-editor",
        state: undefined,
      } as InternalTransmitterUpdate;

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

      const firstStrand = {
        documentId: "test-doc-1",
        documentType: "powerhouse/package",
        state: firstState,
      } as InternalTransmitterUpdate;

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
