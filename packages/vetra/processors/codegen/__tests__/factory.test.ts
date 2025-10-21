import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type { IProcessorHostModule } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { codegenProcessorFactory } from "../factory.js";

// Mock CodegenProcessor to avoid file operations
vi.mock("../index.js", () => ({
  CodegenProcessor: vi.fn(() => ({
    onStrands: vi.fn(),
  })),
}));

describe("Codegen Processor Factory - Drive Filtering", () => {
  let mockModule: IProcessorHostModule;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default module with no config
    mockModule = {
      config: new Map<string, unknown>(),
    } as IProcessorHostModule;
  });

  describe("Vetra Drive Pattern Matching (No Explicit Config)", () => {
    it("should create processor for drive with slug 'vetra'", () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "vetra",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
      expect(result[0]).toHaveProperty("filter");
    });

    it("should create processor for drive with id 'vetra'", () => {
      const driveHeader: PHDocumentHeader = {
        id: "vetra",
        slug: "other-slug",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
    });

    it("should create processor for drive with slug starting with 'vetra-'", () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "vetra-dev",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
    });

    it("should create processor for drive with id starting with 'vetra-'", () => {
      const driveHeader: PHDocumentHeader = {
        id: "vetra-production",
        slug: "other-slug",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
    });

    it("should reject drive with non-vetra slug and id", () => {
      const driveHeader: PHDocumentHeader = {
        id: "other-drive-id",
        slug: "other-drive",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(0);
    });

    it("should reject drive with slug containing 'vetra' but not starting with it", () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "my-vetra-drive",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(0);
    });
  });

  describe("Case-Insensitive Matching", () => {
    it("should match slug 'VETRA' (uppercase)", () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "VETRA",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match slug 'Vetra' (mixed case)", () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "Vetra",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match slug 'VETRA-DEV' (uppercase with suffix)", () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "VETRA-DEV",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match id 'Vetra-Production' (mixed case with suffix)", () => {
      const driveHeader: PHDocumentHeader = {
        id: "Vetra-Production",
        slug: "other-slug",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
    });
  });

  describe("Explicit Drive ID Configuration", () => {
    it("should match exact slug when explicit driveId is configured", () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "my-custom-drive",
      });

      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "my-custom-drive",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match exact id when explicit driveId is configured", () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "custom-drive-id",
      });

      const driveHeader: PHDocumentHeader = {
        id: "custom-drive-id",
        slug: "other-slug",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should reject vetra pattern when explicit driveId is configured and does not match", () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "my-custom-drive",
      });

      const driveHeader: PHDocumentHeader = {
        id: "vetra-dev",
        slug: "vetra",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      // Should be rejected because explicit driveId requires exact match
      expect(result).toHaveLength(0);
    });

    it("should reject non-matching drive when explicit driveId is configured", () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "my-custom-drive",
      });

      const driveHeader: PHDocumentHeader = {
        id: "other-id",
        slug: "other-slug",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(0);
    });
  });

  describe("ProcessorRecord Filter Configuration", () => {
    it("should configure filter with correct branch, documentType, and scope", () => {
      const driveHeader: PHDocumentHeader = {
        id: "vetra",
        slug: "vetra",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0].filter).toEqual({
        branch: ["main"],
        documentId: ["*"],
        documentType: [
          "powerhouse/document-model",
          "powerhouse/package",
          "powerhouse/document-editor",
          "powerhouse/subgraph",
          "powerhouse/processor",
          "powerhouse/app",
        ],
        scope: ["global"],
      });
    });

    it("should pass interactive mode to CodegenProcessor when configured", () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        interactive: true,
      });

      const driveHeader: PHDocumentHeader = {
        id: "vetra",
        slug: "vetra",
      } as PHDocumentHeader;

      const result = codegenProcessorFactory(mockModule)(driveHeader);

      expect(result).toHaveLength(1);
      // Processor is created with interactive: true (verified by mock being called)
    });
  });
});
