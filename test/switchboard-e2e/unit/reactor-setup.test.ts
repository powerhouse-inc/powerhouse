/**
 * Unit tests for reactor setup
 * 
 * These tests verify that the reactor can be initialized with the core
 * document models needed for E2E testing. They test the infrastructure
 * layer that E2E tests depend on.
 * 
 * NOTE: These tests do NOT duplicate reactor-api tests. They specifically
 * test the switchboard-e2e project configuration and setup.
 */

import { describe, expect, it } from "vitest";
import { expectUUID, setupBasicReactor } from "./test-utils.js";

describe("Switchboard Reactor Setup", () => {
  it("should initialize reactor with core document models", async () => {
    const { reactor } = await setupBasicReactor();

    expect(reactor).toBeDefined();
    
    // Verify the reactor has the expected core models loaded
    const modules = reactor.getDocumentModelModules();
    expect(modules.length).toBeGreaterThanOrEqual(2);
    
    // Check that we have the essential document model types
    const modelIds = modules.map((m) => m.documentModel.global.id);
    expect(modelIds).toContain("powerhouse/document-model");
    expect(modelIds).toContain("powerhouse/document-drive");
  });

  it("should be able to create a drive", async () => {
    const { reactor } = await setupBasicReactor();

    const drive = await reactor.addDrive({
      id: undefined,
      global: {
        name: "test-drive",
        icon: null,
      },
    });

    expect(drive).toBeDefined();
    expect(drive.header.id).toEqual(expectUUID(expect));
    expect(drive.state.global.name).toBe("test-drive");
  });

  it("should be able to list drives", async () => {
    const { reactor } = await setupBasicReactor();

    // Create a couple of test drives
    await reactor.addDrive({
      id: undefined,
      global: { name: "drive-1", icon: null },
    });
    
    await reactor.addDrive({
      id: undefined,
      global: { name: "drive-2", icon: null },
    });

    const drives = await reactor.getDrivesSlugs();
    expect(drives.length).toBeGreaterThanOrEqual(2);
  });

  it("should initialize listener manager", async () => {
    const { listenerManager } = await setupBasicReactor();

    expect(listenerManager).toBeDefined();
    expect(listenerManager.setListener).toBeDefined();
  });
});

describe("Switchboard Reactor Document Operations", () => {
  it("should be able to add a document model document", async () => {
    const { reactor } = await setupBasicReactor();

    const doc = await reactor.addDocument("powerhouse/document-model");

    expect(doc).toBeDefined();
    expect(doc.header.documentType).toBe("powerhouse/document-model");
    expect(doc.header.id).toEqual(expectUUID(expect));
  });

  it("should be able to retrieve a document by id", async () => {
    const { reactor } = await setupBasicReactor();

    const created = await reactor.addDocument("powerhouse/document-model");
    const retrieved = await reactor.getDocument(created.header.id);

    expect(retrieved).toBeDefined();
    expect(retrieved.header.id).toBe(created.header.id);
  });

  it("should throw error when retrieving non-existent document", async () => {
    const { reactor } = await setupBasicReactor();

    await expect(
      reactor.getDocument("non-existent-id-12345"),
    ).rejects.toThrow();
  });
});
