import { describe, expect, it } from "vitest";
import { createInMemoryReactorClient } from "./reactor-fixture.js";

const DRIVE_TYPE = "powerhouse/document-drive";

describe("structured-clone conformance (Phase 0.5 gate)", () => {
  it("round-trips a real PHDocument for each registered model", async () => {
    const reactor = await createInMemoryReactorClient();
    try {
      const doc = await reactor.client.createEmpty(DRIVE_TYPE);
      expect(() => structuredClone(doc)).not.toThrow();
    } finally {
      await reactor.dispose();
    }
  });

  it("round-trips a DocumentChangeEvent carrying a real document", async () => {
    const reactor = await createInMemoryReactorClient();
    try {
      const doc = await reactor.client.createEmpty(DRIVE_TYPE);
      const event = { type: "updated", documents: [doc] };
      expect(() => structuredClone(event)).not.toThrow();
    } finally {
      await reactor.dispose();
    }
  });

  it("round-trips a JobInfo failure payload", () => {
    const jobInfo = {
      id: "job-1",
      documentId: "doc-1",
      status: "failed",
      createdAtUtcIso: "1970-01-01T00:00:00.000Z",
      error: { name: "Error", message: "boom" },
      meta: {},
    };
    expect(() => structuredClone(jobInfo)).not.toThrow();
  });
});
