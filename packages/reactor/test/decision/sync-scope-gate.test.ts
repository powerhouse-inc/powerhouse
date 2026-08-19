import type {
  AuthSubject,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { ILogger } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { IReadGate } from "../../src/decision/read-gate.js";
import { SyncScopeGate } from "../../src/decision/sync-scope-gate.js";
import { DocumentNotFoundError } from "../../src/shared/errors.js";
import type { IDocumentView } from "../../src/storage/interfaces.js";

const SUBJECT: AuthSubject = { address: "0xreader" };

function doc(id = "doc-1"): PHDocument {
  return {
    header: { id, documentType: "test/statement", branch: "main" },
    state: { document: {}, auth: { version: 0, grants: [] }, global: {} },
  } as unknown as PHDocument;
}

function view(get: ReturnType<typeof vi.fn>): IDocumentView {
  return { get } as unknown as IDocumentView;
}

/** A gate that records what it was handed and serves whatever it is told to. */
function readGate(served: ReadonlySet<string>): IReadGate & {
  scopePredicate: ReturnType<typeof vi.fn>;
} {
  return {
    scopePredicate: vi
      .fn()
      .mockResolvedValue((scope: string) => served.has(scope)),
  };
}

describe("resolving a read predicate from a document id", () => {
  it("fetches the document on the branch it was asked about", async () => {
    const get = vi.fn().mockResolvedValue(doc());
    const gate = readGate(new Set(["global"]));

    const readable = await new SyncScopeGate(
      gate,
      view(get),
    ).scopePredicateById("doc-1", SUBJECT, "draft");

    expect(get).toHaveBeenCalledWith(
      "doc-1",
      { branch: "draft" },
      undefined,
      undefined,
    );
    expect(readable("global")).toBe(true);
  });

  it("hands the fetched document, subject and branch to the gate", async () => {
    const fetched = doc();
    const gate = readGate(new Set());
    const signal = new AbortController().signal;

    await new SyncScopeGate(
      gate,
      view(vi.fn().mockResolvedValue(fetched)),
    ).scopePredicateById("doc-1", SUBJECT, "main", signal);

    expect(gate.scopePredicate).toHaveBeenCalledWith(
      fetched,
      SUBJECT,
      "main",
      signal,
    );
  });

  it("answers whatever the gate answers", async () => {
    const gate = readGate(new Set(["auth", "document"]));

    const readable = await new SyncScopeGate(
      gate,
      view(vi.fn().mockResolvedValue(doc())),
    ).scopePredicateById("doc-1", SUBJECT, "main");

    expect(readable("global")).toBe(false);
    expect(readable("auth")).toBe(true);
  });

  /**
   * Withholding rather than throwing is what makes this recoverable: the entry
   * stays in the outbox, so a document the read side has not indexed yet is
   * served on a later poll instead of being dropped.
   */
  it("serves the metadata only for a document the read side does not hold", async () => {
    const gate = readGate(new Set(["global"]));
    const get = vi.fn().mockRejectedValue(new DocumentNotFoundError("doc-1"));

    const readable = await new SyncScopeGate(
      gate,
      view(get),
    ).scopePredicateById("doc-1", SUBJECT, "main");

    expect(readable("global")).toBe(false);
    expect(readable("auth")).toBe(true);
    expect(readable("document")).toBe(true);
    expect(gate.scopePredicate).not.toHaveBeenCalled();
  });

  it("surfaces a read side that failed for any other reason", async () => {
    const get = vi.fn().mockRejectedValue(new Error("connection terminated"));

    await expect(
      new SyncScopeGate(readGate(new Set()), view(get)).scopePredicateById(
        "doc-1",
        SUBJECT,
        "main",
      ),
    ).rejects.toThrow("connection terminated");
  });

  it("records a withheld absence where an operator can find it", async () => {
    const logger = { verbose: vi.fn() } as unknown as ILogger;
    const get = vi.fn().mockRejectedValue(new DocumentNotFoundError("doc-1"));

    await new SyncScopeGate(
      readGate(new Set()),
      view(get),
      logger,
    ).scopePredicateById("doc-1", SUBJECT, "main");

    expect(logger.verbose).toHaveBeenCalled();
  });
});
