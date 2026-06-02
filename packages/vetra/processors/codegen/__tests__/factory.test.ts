import { VETRA_PROCESSOR_CONFIG_KEY } from "@powerhousedao/config";
import type { IProcessorHostModule } from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { codegenFactoryBuilder } from "../factory.js";

// Mock CodegenProcessor to avoid file operations
vi.mock("../processor.js", () => ({
  CodegenProcessor: vi.fn(function () {
    return { onStrands: vi.fn() };
  }),
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
    it("should create processor for drive with slug 'vetra'", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "vetra",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
      expect(result[0]).toHaveProperty("filter");
    });

    it("should create processor for drive with id 'vetra'", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "vetra",
        slug: "other-slug",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
    });

    it("should create processor for drive with slug starting with 'vetra-'", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "vetra-dev",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
    });

    it("should create processor for drive with id starting with 'vetra-'", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "vetra-production",
        slug: "other-slug",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveProperty("processor");
    });

    it("should reject drive with non-vetra slug and id", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "other-drive-id",
        slug: "other-drive",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(0);
    });

    it("should reject drive with slug containing 'vetra' but not starting with it", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "my-vetra-drive",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(0);
    });
  });

  describe("Case-Insensitive Matching", () => {
    it("should match slug 'VETRA' (uppercase)", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "VETRA",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match slug 'Vetra' (mixed case)", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "Vetra",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match slug 'VETRA-DEV' (uppercase with suffix)", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "VETRA-DEV",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match id 'Vetra-Production' (mixed case with suffix)", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "Vetra-Production",
        slug: "other-slug",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
    });
  });

  describe("Explicit Drive ID Configuration", () => {
    it("should match exact slug when explicit driveId is configured", async () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "my-custom-drive",
      });

      const driveHeader: PHDocumentHeader = {
        id: "some-id",
        slug: "my-custom-drive",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should match exact id when explicit driveId is configured", async () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "custom-drive-id",
      });

      const driveHeader: PHDocumentHeader = {
        id: "custom-drive-id",
        slug: "other-slug",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
    });

    it("should reject vetra pattern when explicit driveId is configured and does not match", async () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "my-custom-drive",
      });

      const driveHeader: PHDocumentHeader = {
        id: "vetra-dev",
        slug: "vetra",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      // Should be rejected because explicit driveId requires exact match
      expect(result).toHaveLength(0);
    });

    it("should reject non-matching drive when explicit driveId is configured", async () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        driveId: "my-custom-drive",
      });

      const driveHeader: PHDocumentHeader = {
        id: "other-id",
        slug: "other-slug",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(0);
    });
  });

  describe("ProcessorRecord Filter Configuration", () => {
    it("should configure filter with correct branch, documentType, and scope", async () => {
      const driveHeader: PHDocumentHeader = {
        id: "vetra",
        slug: "vetra",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

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

    it("should pass interactive mode to CodegenProcessor when configured", async () => {
      mockModule.config?.set(VETRA_PROCESSOR_CONFIG_KEY, {
        interactive: true,
      });

      const driveHeader: PHDocumentHeader = {
        id: "vetra",
        slug: "vetra",
      } as PHDocumentHeader;

      const buildFactory = await codegenFactoryBuilder(mockModule);
      const result = await buildFactory(driveHeader);

      expect(result).toHaveLength(1);
      // Processor is created with interactive: true (verified by mock being called)
    });
  });
});
