import type { Operation } from "document-model";
import {
  baseCreateDocument,
  getDocumentLastModified,
  updateHeaderRevision,
} from "document-model/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPHDocumentCreateState, fakeOperation } from "../helpers.js";

function createTestDocument() {
  return baseCreateDocument(defaultPHDocumentCreateState);
}

describe("getDocumentLastModified", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns header timestamp when no operations exist", () => {
    const doc = createTestDocument();
    doc.operations = { global: [], local: [] };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(doc.header.lastModifiedAtUtcIso);
  });

  it("returns latest operation timestamp by index", () => {
    const doc = createTestDocument();

    vi.setSystemTime(new Date("2024-01-15T13:00:00.000Z"));
    const op0 = fakeOperation(0, 0, "global");

    vi.setSystemTime(new Date("2024-01-15T14:00:00.000Z"));
    const op1 = fakeOperation(1, 0, "global");

    doc.operations = { global: [op0, op1], local: [] };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(op1.timestampUtcMs);
  });

  it("uses skip as tiebreaker when index is equal", () => {
    const doc = createTestDocument();

    vi.setSystemTime(new Date("2024-01-15T13:00:00.000Z"));
    const opSkip0 = fakeOperation(0, 0, "global");

    vi.setSystemTime(new Date("2024-01-15T14:00:00.000Z"));
    const opSkip1 = fakeOperation(0, 1, "global");

    doc.operations = { global: [opSkip0, opSkip1], local: [] };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(opSkip1.timestampUtcMs);
  });

  it("finds latest across multiple scopes", () => {
    const doc = createTestDocument();

    vi.setSystemTime(new Date("2024-01-15T13:00:00.000Z"));
    const globalOp = fakeOperation(0, 0, "global");

    vi.setSystemTime(new Date("2024-01-15T14:00:00.000Z"));
    const localOp = fakeOperation(1, 0, "local");

    doc.operations = { global: [globalOp], local: [localOp] };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(localOp.timestampUtcMs);
  });

  it("falls back to header timestamp when operations have empty timestampUtcMs", () => {
    const doc = createTestDocument();

    const op = fakeOperation(0, 0, "global");
    op.timestampUtcMs = "";

    doc.operations = { global: [op], local: [] };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(doc.header.lastModifiedAtUtcIso);
  });

  it("falls back to header timestamp when operations have undefined timestampUtcMs", () => {
    const doc = createTestDocument();

    const op = fakeOperation(0, 0, "global");
    op.timestampUtcMs = undefined as unknown as string;

    doc.operations = { global: [op], local: [] };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(doc.header.lastModifiedAtUtcIso);
  });

  it("skips undefined scope arrays in operations", () => {
    const doc = createTestDocument();

    vi.setSystemTime(new Date("2024-01-15T14:00:00.000Z"));
    const op = fakeOperation(0, 0, "local");

    doc.operations = {
      global: undefined as unknown as Operation[],
      local: [op],
    };

    const result = getDocumentLastModified(doc);

    expect(result).toBe(op.timestampUtcMs);
  });

  it("selects by index not by timestamp", () => {
    const doc = createTestDocument();

    // Higher-index op gets an OLDER timestamp
    vi.setSystemTime(new Date("2024-01-15T15:00:00.000Z"));
    const op0 = fakeOperation(0, 0, "global");

    vi.setSystemTime(new Date("2024-01-15T13:00:00.000Z"));
    const op1 = fakeOperation(1, 0, "global");

    doc.operations = { global: [op0, op1], local: [] };

    const result = getDocumentLastModified(doc);

    // Should return op1's (older) timestamp because it has the higher index
    expect(result).toBe(op1.timestampUtcMs);
    expect(result).not.toBe(op0.timestampUtcMs);
  });

  it("returns operation timestamp even when it is earlier than header timestamp", () => {
    // Header created at 12:00
    const doc = createTestDocument();
    const headerTimestamp = doc.header.lastModifiedAtUtcIso;

    // Operation has a timestamp earlier than the header
    vi.setSystemTime(new Date("2024-01-15T10:00:00.000Z"));
    const op = fakeOperation(0, 0, "global");
    doc.operations = { global: [op], local: [] };

    const result = getDocumentLastModified(doc);

    // Returns the operation's earlier timestamp, not the header's
    expect(result).toBe(op.timestampUtcMs);
    expect(result < headerTimestamp).toBe(true);
  });
});

describe("updateHeaderRevision", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-15T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates revision for the given scope", () => {
    const doc = createTestDocument();
    const op = fakeOperation(0, 0, "global");
    doc.operations = { global: [op], local: [] };

    const updated = updateHeaderRevision(doc, "global");

    expect(updated.header.revision.global).toBe(1);
  });

  it("uses provided timestamp when available", () => {
    const doc = createTestDocument();
    const explicitTimestamp = "2024-06-01T00:00:00.000Z";

    const updated = updateHeaderRevision(doc, "global", explicitTimestamp);

    expect(updated.header.lastModifiedAtUtcIso).toBe(explicitTimestamp);
  });

  it("scans operations when timestamp not provided", () => {
    const doc = createTestDocument();

    vi.setSystemTime(new Date("2024-06-01T00:00:00.000Z"));
    const op = fakeOperation(0, 0, "global");
    doc.operations = { global: [op], local: [] };

    const updated = updateHeaderRevision(doc, "global");

    expect(updated.header.lastModifiedAtUtcIso).toBe(op.timestampUtcMs);
  });

  it("prevents timestamp regression with explicit timestamp", () => {
    const futureTimestamp = "2025-01-01T00:00:00.000Z";
    const doc = createTestDocument();
    const docWithFutureHeader = {
      ...doc,
      header: { ...doc.header, lastModifiedAtUtcIso: futureTimestamp },
    };

    const olderTimestamp = "2024-06-01T00:00:00.000Z";
    const updated = updateHeaderRevision(
      docWithFutureHeader,
      "global",
      olderTimestamp,
    );

    expect(updated.header.lastModifiedAtUtcIso).toBe(futureTimestamp);
  });

  it("prevents timestamp regression when scanning operations", () => {
    const doc = createTestDocument();
    // Set header to a future timestamp
    const futureTimestamp = "2025-01-01T00:00:00.000Z";
    doc.header.lastModifiedAtUtcIso = futureTimestamp;

    // Add an operation with a timestamp older than the header
    vi.setSystemTime(new Date("2024-03-01T00:00:00.000Z"));
    const op = fakeOperation(0, 0, "global");
    doc.operations = { global: [op], local: [] };

    // Omit explicit timestamp — forces scan via getDocumentLastModified
    const updated = updateHeaderRevision(doc, "global");

    expect(updated.header.lastModifiedAtUtcIso).toBe(futureTimestamp);
  });

  it("compares timestamps correctly when precision differs", () => {
    const doc = createTestDocument();
    // Header has millisecond precision
    const currentTimestamp = "2025-01-01T00:00:00.000Z";
    doc.header.lastModifiedAtUtcIso = currentTimestamp;

    // New timestamp lacks milliseconds — same instant, but lexicographically
    // "Z" (90) > "." (46) would make string comparison treat it as later
    const sameInstantNoMs = "2025-01-01T00:00:00Z";
    const updated = updateHeaderRevision(doc, "global", sameInstantNoMs);

    // Should keep the current timestamp since they represent the same instant
    expect(updated.header.lastModifiedAtUtcIso).toBe(currentTimestamp);
  });

  it("advances timestamp when new is later", () => {
    const doc = createTestDocument();
    doc.header.lastModifiedAtUtcIso = "2023-01-01T00:00:00.000Z";

    const newerTimestamp = "2024-06-01T00:00:00.000Z";
    const updated = updateHeaderRevision(doc, "global", newerTimestamp);

    expect(updated.header.lastModifiedAtUtcIso).toBe(newerTimestamp);
  });

  it("sets timestamp when header has no current timestamp", () => {
    const doc = createTestDocument();
    doc.header.lastModifiedAtUtcIso = "";

    const newTimestamp = "2024-06-01T00:00:00.000Z";
    const updated = updateHeaderRevision(doc, "global", newTimestamp);

    expect(updated.header.lastModifiedAtUtcIso).toBe(newTimestamp);
  });

  it("preserves revision for other scopes", () => {
    const doc = createTestDocument();
    const op = fakeOperation(0, 0, "global");
    doc.operations = { global: [op], local: [] };
    doc.header.revision = { global: 5, local: 3 };

    const updated = updateHeaderRevision(
      doc,
      "global",
      "2024-06-01T00:00:00.000Z",
    );

    expect(updated.header.revision.global).toBe(1);
    expect(updated.header.revision.local).toBe(3);
  });

  it("computes revision from last operation index", () => {
    const doc = createTestDocument();
    const op0 = fakeOperation(0, 0, "global");
    const op1 = fakeOperation(1, 0, "global");
    const op2 = fakeOperation(2, 0, "global");
    doc.operations = { global: [op0, op1, op2], local: [] };

    const updated = updateHeaderRevision(
      doc,
      "global",
      "2024-06-01T00:00:00.000Z",
    );

    expect(updated.header.revision.global).toBe(3);
  });

  it("sets revision to 0 when scope has no operations", () => {
    const doc = createTestDocument();
    doc.operations = { global: [], local: [] };

    const updated = updateHeaderRevision(
      doc,
      "local",
      "2024-06-01T00:00:00.000Z",
    );

    expect(updated.header.revision.local).toBe(0);
  });

  it("sets revision to 0 when scope is missing from operations", () => {
    const doc = createTestDocument();
    doc.operations = { global: [] };

    const updated = updateHeaderRevision(
      doc,
      "local",
      "2024-06-01T00:00:00.000Z",
    );

    expect(updated.header.revision.local).toBe(0);
  });
});
