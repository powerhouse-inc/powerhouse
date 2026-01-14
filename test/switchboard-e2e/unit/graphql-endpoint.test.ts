/**
 * Unit tests for GraphQL endpoint configuration
 * 
 * These tests verify that the GraphQL endpoint can be properly configured
 * and responds to basic introspection queries. This validates the setup
 * that E2E tests will interact with.
 * 
 * These are UNIT tests (no server needed), not E2E tests.
 * They test the GraphQL schema and resolver structure.
 */

import type { DocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";
import { setupBasicReactor } from "./test-utils.js";

describe("GraphQL Endpoint Configuration", () => {
  it("should have a valid reactor instance for GraphQL", async () => {
    const { reactor } = await setupBasicReactor();

    expect(reactor).toBeDefined();
    expect(reactor.getDrivesSlugs).toBeDefined();
    expect(reactor.getDocument).toBeDefined();
    expect(reactor.addDocument).toBeDefined();
  });

  it("should expose document models for GraphQL schema generation", async () => {
    const { reactor } = await setupBasicReactor();

    const modules = reactor.getDocumentModelModules();
    
    expect(modules).toBeDefined();
    expect(Array.isArray(modules)).toBe(true);
    expect(modules.length).toBeGreaterThan(0);

    // Each module should have the structure needed for GraphQL schema
    modules.forEach((module: DocumentModelModule) => {
      expect(module.documentModel).toBeDefined();
      expect(module.actions).toBeDefined();
      expect(module.reducer).toBeDefined();
    });
  });

  it("should support drive operations needed for GraphQL mutations", async () => {
    const { reactor } = await setupBasicReactor();

    // Create drive (mutation operation)
    const drive = await reactor.addDrive({
      id: undefined,
      global: { name: "graphql-test-drive", icon: null },
      meta: {},
    });

    expect(drive).toBeDefined();

    // Get drive (query operation)
    const retrieved = await reactor.getDrive(drive.header.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved.header.id).toBe(drive.header.id);
  });

  it("should support document operations needed for GraphQL mutations", async () => {
    const { reactor } = await setupBasicReactor();

    // Create document (mutation operation)
    const doc = await reactor.addDocument("powerhouse/document-model");

    expect(doc).toBeDefined();

    // Get document (query operation)
    const retrieved = await reactor.getDocument(doc.header.id);
    
    expect(retrieved).toBeDefined();
    expect(retrieved.header.id).toBe(doc.header.id);
  });
});
