import {
  driveDocumentModelModule,
  ReactorBuilder,
  type IDocumentDriveServer,
} from "document-drive";
import {
  documentModelDocumentModelModule,
  setName,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "vitest-browser-react";
import { DocumentCache } from "../../src/document-cache.js";
import {
  addDocumentCacheEventHandler,
  setDocumentCache,
  useDocument,
  useDocumentCache,
  useDocuments,
  useGetDocument,
  useGetDocumentAsync,
  useGetDocuments,
} from "../../src/hooks/document-cache.js";
import type { IDocumentCache } from "../../src/types/documents.js";

function createMockDocument(id: string, name = "Test Document"): PHDocument {
  const document = documentModelDocumentModelModule.utils.createDocument();
  document.header.id = id;
  document.header.name = name;
  return document;
}

async function createDocumentCache(
  documents: PHDocument[] = [],
): Promise<{ reactor: IDocumentDriveServer; cache: IDocumentCache }> {
  const legacyReactor = new ReactorBuilder([
    driveDocumentModelModule,
    documentModelDocumentModelModule,
  ] as unknown as DocumentModelModule[]).build();

  for (const document of documents) {
    await legacyReactor.addDocument(document);
  }
  return {
    reactor: legacyReactor,
    cache: new DocumentCache(legacyReactor),
  };
}

function SuspenseWrapper({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<div>Loading...</div>}>{children}</Suspense>;
}

describe("document-cache hooks", () => {
  beforeEach(() => {
    window.ph = {};
    addDocumentCacheEventHandler();
  });

  afterEach(() => {
    delete window.ph;
  });

  describe("useDocumentCache", () => {
    it("should return undefined when document cache is not set", () => {
      const { result } = renderHook(() => useDocumentCache());
      expect(result.current).toBeUndefined();
    });

    it("should return document cache when set", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useDocumentCache());
      expect(result.current).toBe(cache);
    });

    it("should update when document cache changes", async () => {
      const { cache: cache1 } = await createDocumentCache();
      const { cache: cache2 } = await createDocumentCache();

      setDocumentCache(cache1);
      const { result } = renderHook(() => useDocumentCache());
      expect(result.current).toBe(cache1);

      setDocumentCache(cache2);
      await vi.waitFor(() => {
        expect(result.current).toBe(cache2);
      });
    });
  });

  describe("useDocument", () => {
    it("should return undefined when id is null", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useDocument(null), {
        wrapper: SuspenseWrapper,
      });

      expect(result.current).toBeUndefined();
    });

    it("should return undefined when id is undefined", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useDocument(undefined), {
        wrapper: SuspenseWrapper,
      });

      expect(result.current).toBeUndefined();
    });

    it("should return document when id is valid", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document 1");
      const { cache } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(() => useDocument("doc-1"), {
        wrapper: SuspenseWrapper,
      });

      // Suspense hooks need rerender after the promise resolves
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toBeDefined();
        expect(result.current?.header.name).toBe("Test Document 1");
      });
    });

    it("should update when document receives new operation", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document 1");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(() => useDocument("doc-1"), {
        wrapper: SuspenseWrapper,
      });

      // Suspense hooks need rerender after the promise resolves
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toBeDefined();
        expect(result.current?.header.name).toBe("Test Document 1");
      });

      await reactor.addAction(mockDoc.header.id, setName("Updated Name"));

      await vi.waitFor(() => {
        rerender();
        expect(result.current).toBeDefined();
        expect(result.current?.header.name).toBe("Updated Name");
      });
    });

    it("should throw when document is deleted", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document 1");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      // Track errors thrown during rendering
      const errors: Error[] = [];
      const handler = (event: PromiseRejectionEvent) => {
        const reason = event.reason as Error | undefined;
        if (reason?.message.includes("doc-1")) {
          errors.push(reason);
          event.preventDefault();
        }
      };
      window.addEventListener("unhandledrejection", handler);

      const { result, rerender } = renderHook(() => useDocument("doc-1"), {
        wrapper: SuspenseWrapper,
      });

      // Wait for document to load
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toBeDefined();
        expect(result.current?.header.name).toBe("Test Document 1");
      });

      // Delete the document
      await reactor.deleteDocument(mockDoc.header.id);

      // Wait for error to be thrown when trying to refetch deleted document
      await vi.waitFor(() => {
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("doc-1");
      });

      window.removeEventListener("unhandledrejection", handler);
    });
  });

  describe("useDocuments", () => {
    it("should return empty array when ids is null", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useDocuments(null), {
        wrapper: SuspenseWrapper,
      });

      expect(result.current).toEqual([]);
    });

    it("should return empty array when ids is undefined", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useDocuments(undefined), {
        wrapper: SuspenseWrapper,
      });

      expect(result.current).toEqual([]);
    });

    it("should return empty array when ids is empty", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useDocuments([]), {
        wrapper: SuspenseWrapper,
      });

      expect(result.current).toEqual([]);
    });

    it("should return documents when ids are valid", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache } = await createDocumentCache([mockDoc1, mockDoc2]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(
        () => useDocuments(["doc-1", "doc-2"]),
        {
          wrapper: SuspenseWrapper,
        },
      );

      // Suspense hooks need rerender after the promise resolves
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toHaveLength(2);
        expect(result.current[0]?.header.name).toBe("Document 1");
        expect(result.current[1]?.header.name).toBe("Document 2");
      });
    });

    it("should update when one of the documents receives a new operation", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache, reactor } = await createDocumentCache([
        mockDoc1,
        mockDoc2,
      ]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(
        () => useDocuments(["doc-1", "doc-2"]),
        {
          wrapper: SuspenseWrapper,
        },
      );

      // Suspense hooks need rerender after the promise resolves
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toHaveLength(2);
        expect(result.current[0]?.header.name).toBe("Document 1");
        expect(result.current[1]?.header.name).toBe("Document 2");
      });

      // Update only the second document
      await reactor.addAction(
        mockDoc2.header.id,
        setName("Updated Document 2"),
      );

      await vi.waitFor(() => {
        rerender();
        expect(result.current[0]?.header.name).toBe("Document 1");
        expect(result.current[1]?.header.name).toBe("Updated Document 2");
      });
    });

    it("should throw when one of the documents is deleted", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache, reactor } = await createDocumentCache([
        mockDoc1,
        mockDoc2,
      ]);
      setDocumentCache(cache);

      // Track errors thrown during rendering
      const errors: Error[] = [];
      const handler = (event: PromiseRejectionEvent) => {
        const reason = event.reason as Error | undefined;
        if (reason?.message.includes("doc-2")) {
          errors.push(reason);
          event.preventDefault();
        }
      };
      window.addEventListener("unhandledrejection", handler);

      const { result, rerender } = renderHook(
        () => useDocuments(["doc-1", "doc-2"]),
        {
          wrapper: SuspenseWrapper,
        },
      );

      // Wait for documents to load
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toHaveLength(2);
        expect(result.current[0]?.header.name).toBe("Document 1");
        expect(result.current[1]?.header.name).toBe("Document 2");
      });

      // Delete the second document
      await reactor.deleteDocument(mockDoc2.header.id);

      // Wait for error to be thrown when trying to refetch deleted document
      await vi.waitFor(() => {
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0].message).toContain("doc-2");
      });

      window.removeEventListener("unhandledrejection", handler);
    });
  });

  describe("useGetDocument", () => {
    it("should return a function that rejects when cache is not initialized", async () => {
      const { result } = renderHook(() => useGetDocument());

      const getDocument = result.current;
      await expect(getDocument("doc-1")).rejects.toThrow(
        "Document cache not initialized",
      );
    });

    it("should return a function that gets a document from cache", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result } = renderHook(() => useGetDocument());

      const getDocument = result.current;
      const doc = await getDocument("doc-1");

      expect(doc.header.name).toBe("Test Document");
    });

    it("should return the updated document when called after an operation is added", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, act } = renderHook(() => useGetDocument());

      const getDocument = result.current;
      const doc = await getDocument("doc-1");

      expect(doc.header.name).toBe("Test Document");

      act(() => {
        reactor
          .addAction(mockDoc.header.id, setName("Updated Document"))
          .catch((error) => {
            throw error;
          });
      });

      await vi.waitFor(async () => {
        const updatedDoc = await getDocument("doc-1");
        expect(updatedDoc.header.name).toBe("Updated Document");
      });
    });

    it("should return same object returned by useDocument", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(() => useDocument("doc-1"), {
        wrapper: SuspenseWrapper,
      });
      const { result: getResult } = renderHook(() => useGetDocument());

      // Suspense hooks need rerender after the promise resolves
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toBeDefined();
        expect(result.current?.header.name).toBe("Test Document");
      });

      const getDocument = getResult.current;
      const doc = await getDocument("doc-1");
      expect(doc.header.name).toBe("Test Document");
      expect(doc).toBe(result.current);
    });

    it("should return latest state of document", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender, unmount } = renderHook(
        () => useDocument("doc-1"),
        {
          wrapper: SuspenseWrapper,
        },
      );

      await vi.waitFor(() => {
        rerender();
        expect(result.current).toBeDefined();
        expect(result.current?.header.name).toBe("Test Document");
      });
      unmount();

      const { result: getResult, rerender: getRerender } = renderHook(() =>
        useGetDocument(),
      );

      const getDocument = getResult.current;

      await reactor.addAction(mockDoc.header.id, setName("Updated Document"));

      await vi.waitFor(async () => {
        getRerender();
        const doc = await getDocument("doc-1");
        expect(doc.header.name).toBe("Updated Document");
      });
    });

    it("should reject when document is deleted", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result } = renderHook(() => useGetDocument());

      const getDocument = result.current;
      const doc = await getDocument("doc-1");
      expect(doc.header.name).toBe("Test Document");

      // Delete the document
      await reactor.deleteDocument(mockDoc.header.id);

      // Subsequent calls should reject
      await expect(getDocument("doc-1")).rejects.toThrow();
    });
  });

  describe("useGetDocuments", () => {
    it("should return a function that rejects when cache is not initialized", async () => {
      const { result } = renderHook(() => useGetDocuments());

      const getDocuments = result.current;
      await expect(getDocuments(["doc-1"])).rejects.toThrow(
        "Document cache not initialized",
      );
    });

    it("should return a function that gets documents from cache", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache } = await createDocumentCache([mockDoc1, mockDoc2]);
      setDocumentCache(cache);

      const { result } = renderHook(() => useGetDocuments());

      const getDocuments = result.current;
      const docs = await getDocuments(["doc-1", "doc-2"]);

      expect(docs[0].header.name).toBe("Document 1");
      expect(docs[1].header.name).toBe("Document 2");
    });

    it("should return the updated documents when called after an operation is added", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache, reactor } = await createDocumentCache([
        mockDoc1,
        mockDoc2,
      ]);
      setDocumentCache(cache);

      const { result, act } = renderHook(() => useGetDocuments());

      const getDocuments = result.current;
      const docs = await getDocuments(["doc-1", "doc-2"]);

      expect(docs[0].header.name).toBe("Document 1");
      expect(docs[1].header.name).toBe("Document 2");

      act(() => {
        reactor
          .addAction(mockDoc2.header.id, setName("Updated Document 2"))
          .catch((error) => {
            throw error;
          });
      });

      await vi.waitFor(async () => {
        const updatedDocs = await getDocuments(["doc-1", "doc-2"]);
        expect(updatedDocs[0].header.name).toBe("Document 1");
        expect(updatedDocs[1].header.name).toBe("Updated Document 2");
      });
    });

    it("should return same objects returned by useDocuments", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache } = await createDocumentCache([mockDoc1, mockDoc2]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(
        () => useDocuments(["doc-1", "doc-2"]),
        {
          wrapper: SuspenseWrapper,
        },
      );
      const { result: getResult } = renderHook(() => useGetDocuments());

      // Suspense hooks need rerender after the promise resolves
      await vi.waitFor(() => {
        rerender();
        expect(result.current).toHaveLength(2);
        expect(result.current[0]?.header.name).toBe("Document 1");
        expect(result.current[1]?.header.name).toBe("Document 2");
      });

      const getDocuments = getResult.current;
      const docs = await getDocuments(["doc-1", "doc-2"]);
      expect(docs[0].header.name).toBe("Document 1");
      expect(docs[1].header.name).toBe("Document 2");
      expect(docs[0]).toBe(result.current[0]);
      expect(docs[1]).toBe(result.current[1]);
    });

    it("should return latest state of documents", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache, reactor } = await createDocumentCache([
        mockDoc1,
        mockDoc2,
      ]);
      setDocumentCache(cache);

      const { result, rerender, unmount } = renderHook(
        () => useDocuments(["doc-1", "doc-2"]),
        {
          wrapper: SuspenseWrapper,
        },
      );

      await vi.waitFor(() => {
        rerender();
        expect(result.current).toHaveLength(2);
        expect(result.current[0]?.header.name).toBe("Document 1");
        expect(result.current[1]?.header.name).toBe("Document 2");
      });
      unmount();

      const { result: getResult, rerender: getRerender } = renderHook(() =>
        useGetDocuments(),
      );

      const getDocuments = getResult.current;

      await reactor.addAction(
        mockDoc2.header.id,
        setName("Updated Document 2"),
      );

      await vi.waitFor(async () => {
        getRerender();
        const docs = await getDocuments(["doc-1", "doc-2"]);
        expect(docs[0].header.name).toBe("Document 1");
        expect(docs[1].header.name).toBe("Updated Document 2");
      });
    });

    it("should reject when one of the documents is deleted", async () => {
      const mockDoc1 = createMockDocument("doc-1", "Document 1");
      const mockDoc2 = createMockDocument("doc-2", "Document 2");
      const { cache, reactor } = await createDocumentCache([
        mockDoc1,
        mockDoc2,
      ]);
      setDocumentCache(cache);

      const { result } = renderHook(() => useGetDocuments());

      const getDocuments = result.current;
      const docs = await getDocuments(["doc-1", "doc-2"]);
      expect(docs[0].header.name).toBe("Document 1");
      expect(docs[1].header.name).toBe("Document 2");

      // Delete the second document
      await reactor.deleteDocument(mockDoc2.header.id);

      // Subsequent calls should reject because doc-2 no longer exists
      await expect(getDocuments(["doc-1", "doc-2"])).rejects.toThrow();
    });
  });

  describe("useGetDocumentAsync", () => {
    it("should return initial state when id is null", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useGetDocumentAsync(null));

      expect(result.current).toEqual({
        status: "initial",
        data: undefined,
        isPending: false,
        error: undefined,
        reload: undefined,
      });
    });

    it("should return initial state when id is undefined", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      const { result } = renderHook(() => useGetDocumentAsync(undefined));

      expect(result.current).toEqual({
        status: "initial",
        data: undefined,
        isPending: false,
        error: undefined,
        reload: undefined,
      });
    });

    it("should return initial state when document cache is not set", () => {
      const { result } = renderHook(() => useGetDocumentAsync("doc-1"));

      expect(result.current).toEqual({
        status: "initial",
        data: undefined,
        isPending: false,
        error: undefined,
        reload: undefined,
      });
    });

    it("should return success state when document is loaded", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(() =>
        useGetDocumentAsync("doc-1"),
      );

      // Wait for the promise to settle, then rerender to get updated state
      await vi.waitFor(() => {
        rerender();
        expect(result.current.status).toBe("success");
      });

      expect(result.current.data?.header.name).toBe("Test Document");
      expect(result.current.isPending).toBe(false);
      expect(result.current.error).toBeUndefined();
      expect(result.current.reload).toBeDefined();
    });

    it("should return error state for non-existent document", async () => {
      const { cache } = await createDocumentCache();
      setDocumentCache(cache);

      // Suppress unhandled rejection warning for this test
      const handler = (event: PromiseRejectionEvent) => {
        const reason = event.reason as Error | undefined;
        if (reason?.message.includes("non-existent")) {
          event.preventDefault();
        }
      };
      window.addEventListener("unhandledrejection", handler);

      const { result, rerender } = renderHook(() =>
        useGetDocumentAsync("non-existent"),
      );

      // Initially returns pending state while fetching
      expect(result.current.status).toBe("pending");
      expect(result.current.data).toBeUndefined();
      expect(result.current.isPending).toBe(true);

      // Wait for the error state after the promise rejects
      await vi.waitFor(() => {
        rerender();
        expect(result.current.status).toBe("error");
      });

      expect(result.current.error).toBeDefined();
      expect(result.current.isPending).toBe(false);

      window.removeEventListener("unhandledrejection", handler);
    });

    it("should provide reload function that refetches document", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(() =>
        useGetDocumentAsync("doc-1"),
      );

      // Wait for the promise to settle, then rerender to get updated state
      await vi.waitFor(() => {
        rerender();
        expect(result.current.reload).toBeDefined();
      });

      // Calling reload should not throw
      expect(() => result.current.reload!()).not.toThrow();
    });

    it("should return updated document after reload when operation is added", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result, rerender } = renderHook(() =>
        useGetDocumentAsync("doc-1"),
      );

      // Wait for the initial load
      await vi.waitFor(() => {
        rerender();
        expect(result.current.status).toBe("success");
        expect(result.current.data?.header.name).toBe("Test Document");
      });

      // Add an operation to update the document
      await reactor.addAction(mockDoc.header.id, setName("Updated Document"));

      // Call reload to refetch the document
      result.current.reload!();

      // Wait for the updated document
      await vi.waitFor(() => {
        rerender();
        expect(result.current.data?.header.name).toBe("Updated Document");
      });
    });

    it("should return same object returned by useDocument", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const { result: docResult, rerender: docRerender } = renderHook(
        () => useDocument("doc-1"),
        {
          wrapper: SuspenseWrapper,
        },
      );
      const { result: asyncResult, rerender: asyncRerender } = renderHook(() =>
        useGetDocumentAsync("doc-1"),
      );

      // Wait for both hooks to load
      await vi.waitFor(() => {
        docRerender();
        expect(docResult.current).toBeDefined();
        expect(docResult.current?.header.name).toBe("Test Document");
      });

      await vi.waitFor(() => {
        asyncRerender();
        expect(asyncResult.current.status).toBe("success");
        expect(asyncResult.current.data?.header.name).toBe("Test Document");
      });

      expect(asyncResult.current.data).toBe(docResult.current);
    });

    it("should return latest state of document after reload", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      const {
        result: docResult,
        rerender: docRerender,
        unmount,
      } = renderHook(() => useDocument("doc-1"), {
        wrapper: SuspenseWrapper,
      });

      await vi.waitFor(() => {
        docRerender();
        expect(docResult.current).toBeDefined();
        expect(docResult.current?.header.name).toBe("Test Document");
      });
      unmount();

      const { result, rerender } = renderHook(() =>
        useGetDocumentAsync("doc-1"),
      );

      await vi.waitFor(() => {
        rerender();
        expect(result.current.status).toBe("success");
      });

      await reactor.addAction(mockDoc.header.id, setName("Updated Document"));

      result.current.reload!();

      await vi.waitFor(() => {
        rerender();
        expect(result.current.data?.header.name).toBe("Updated Document");
      });
    });

    it("should return error state after reload when document is deleted", async () => {
      const mockDoc = createMockDocument("doc-1", "Test Document");
      const { cache, reactor } = await createDocumentCache([mockDoc]);
      setDocumentCache(cache);

      // Suppress unhandled rejection warning for this test
      const handler = (event: PromiseRejectionEvent) => {
        const reason = event.reason as Error | undefined;
        if (reason?.message.includes("doc-1")) {
          event.preventDefault();
        }
      };
      window.addEventListener("unhandledrejection", handler);

      const { result, rerender } = renderHook(() =>
        useGetDocumentAsync("doc-1"),
      );

      // Wait for the initial load
      await vi.waitFor(() => {
        rerender();
        expect(result.current.status).toBe("success");
        expect(result.current.data?.header.name).toBe("Test Document");
      });

      // Delete the document
      await reactor.deleteDocument(mockDoc.header.id);

      // Call reload to refetch the document
      result.current.reload!();

      // Should return error state after reload
      await vi.waitFor(() => {
        rerender();
        expect(result.current.status).toBe("error");
        expect(result.current.error).toBeDefined();
      });

      window.removeEventListener("unhandledrejection", handler);
    });
  });
});
