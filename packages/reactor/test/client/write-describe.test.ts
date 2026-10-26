import { describe, expect, it, vi } from "vitest";
import type { WriteSideParts } from "../../index.js";
import { ReactorClient } from "../../src/client/reactor-client.js";
import type { ReactorWriteClient } from "../../src/client/write-client.js";
import type { IReactor } from "../../src/core/types.js";
import type {
  IDocumentView,
  IOperationStore,
  IWriteIdentityStore,
  WriteIdentityRecord,
} from "../../src/storage/interfaces.js";
import {
  createMockDocumentIndexer,
  createMockDocumentView,
  createMockJobAwaiter,
  createMockLogger,
  createMockSigner,
  createMockSubscriptionManager,
} from "../factories.js";

function identity(
  overrides: Partial<WriteIdentityRecord> = {},
): WriteIdentityRecord {
  return {
    documentId: "doc-1",
    branch: "main",
    slug: "my-slug",
    documentType: "powerhouse/document-model",
    isDeleted: false,
    createdAtUtcIso: "2026-10-25T00:00:00.000Z",
    updatedAtUtcIso: "2026-10-25T00:00:00.000Z",
    ...overrides,
  };
}

/** A view whose every member fails the test when called. */
function forbiddenView(): IDocumentView {
  const view = createMockDocumentView();
  for (const key of Object.keys(view) as (keyof IDocumentView)[]) {
    const member = view[key];
    if (vi.isMockFunction(member)) {
      member.mockImplementation(() => {
        throw new Error(`document view called: ${String(key)}`);
      });
    }
  }
  return view;
}

function writeClient(
  documentView: IDocumentView,
  record: WriteIdentityRecord | undefined,
): { write: ReactorWriteClient; writeSide: WriteSideParts } {
  const identities: IWriteIdentityStore = {
    upsert: vi.fn(),
    resolve: vi.fn().mockResolvedValue(record),
    describe: vi.fn().mockResolvedValue(record),
    delete: vi.fn(),
  };
  const revisions = {
    getRevisions: vi.fn().mockResolvedValue({
      revision: { document: 2, global: 5 },
      latestTimestamp: "2026-10-25T00:00:00.000Z",
    }),
  } as unknown as IOperationStore;
  const writeSide = { identities, revisions };
  const client = new ReactorClient(
    createMockLogger(),
    {} as IReactor,
    createMockSigner(),
    createMockSubscriptionManager(),
    createMockJobAwaiter(),
    createMockDocumentIndexer(),
    documentView,
    undefined,
    undefined,
    undefined,
    undefined,
    writeSide,
  );
  return { write: client.write as ReactorWriteClient, writeSide };
}

describe("ReactorWriteClient.describe", () => {
  it("answers from the identity table and the operation store, never the view", async () => {
    const view = forbiddenView();
    const { write, writeSide } = writeClient(view, identity());

    const described = await write.describe("my-slug");

    expect(described).toEqual({
      documentId: "doc-1",
      documentType: "powerhouse/document-model",
      slug: "my-slug",
      branch: "main",
      revision: { document: 2, global: 5 },
    });
    expect(writeSide.revisions.getRevisions).toHaveBeenCalledWith(
      "doc-1",
      "main",
      undefined,
    );
    for (const member of Object.values(view)) {
      if (vi.isMockFunction(member)) expect(member).not.toHaveBeenCalled();
    }
    expect(write.viewFallbackCount).toBe(0);
  });

  it("reports the id as the slug of a document without one", async () => {
    const { write } = writeClient(forbiddenView(), identity({ slug: null }));

    expect((await write.describe("doc-1")).slug).toBe("doc-1");
  });

  it("does not find a deleted document", async () => {
    const { write } = writeClient(
      forbiddenView(),
      identity({ isDeleted: true, slug: null }),
    );

    await expect(write.describe("doc-1")).rejects.toThrow(
      "Document doc-1 not found",
    );
  });

  it("falls back to the view once, counted, when the table has no row", async () => {
    const view = createMockDocumentView();
    vi.mocked(view.resolveSlug).mockResolvedValue(undefined);
    vi.mocked(view.get).mockResolvedValue({
      header: {
        id: "doc-1",
        documentType: "powerhouse/document-model",
        slug: "my-slug",
        branch: "main",
        revision: { global: 1 },
      },
    } as never);
    const { write } = writeClient(view, undefined);

    const described = await write.describe("doc-1");

    expect(described.revision).toEqual({ global: 1 });
    expect(view.get).toHaveBeenCalledTimes(1);
    expect(write.viewFallbackCount).toBe(1);
  });
});

describe("ReactorWriteClient target resolution", () => {
  it("resolves a slug on the identity table without the view", async () => {
    const { write } = writeClient(forbiddenView(), identity());

    expect(await write.resolveReference("my-slug", "main")).toBe("doc-1");
    expect(write.viewFallbackCount).toBe(0);
  });

  it("resolves a deleted document to its own id", async () => {
    const { write } = writeClient(
      forbiddenView(),
      identity({ isDeleted: true, slug: null }),
    );

    expect(await write.resolveReference("doc-1", "main")).toBe("doc-1");
  });

  it("takes an identifier nothing knows as given, without counting a fallback", async () => {
    const view = createMockDocumentView();
    vi.mocked(view.resolveSlug).mockResolvedValue(undefined);
    const { write } = writeClient(view, undefined);

    expect(await write.resolveReference("in-flight", "main")).toBe("in-flight");
    expect(write.viewFallbackCount).toBe(0);
  });

  it("takes an identifier as given when the view cannot answer", async () => {
    const { write } = writeClient(forbiddenView(), undefined);

    expect(await write.resolveReference("in-flight", "main")).toBe("in-flight");
  });

  it("passes the identity table's ambiguity error through", async () => {
    const { write, writeSide } = writeClient(forbiddenView(), undefined);
    vi.mocked(writeSide.identities.resolve).mockRejectedValue(
      new Error('Ambiguous identifier "x"'),
    );

    await expect(write.resolveReference("x", "main")).rejects.toThrow(
      /Ambiguous identifier/,
    );
  });
});
