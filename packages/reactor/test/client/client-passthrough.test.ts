import type { BaseDocumentDriveServer } from "document-drive";
import {
  MemoryStorage,
  ReactorBuilder,
  driveDocumentModelModule,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorClientBuilder } from "../../src/core/builder.js";
import { Reactor } from "../../src/core/reactor.js";
import type { IReactor } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import type { IEventBus } from "../../src/events/interfaces.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import { InMemoryQueue } from "../../src/queue/queue.js";
import type { ISigner } from "../../src/signer/types.js";
import { createDocModelDocument, createTestDocuments } from "../factories.js";

describe("ReactorClient Passthrough Functions", () => {
  let reactor: IReactor;
  let client: IReactorClient;
  let driveServer: BaseDocumentDriveServer;
  let storage: MemoryStorage;
  let eventBus: IEventBus;
  let queue: IQueue;

  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  beforeEach(async () => {
    // Mock time to ensure consistent timestamps
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2024-01-01T00:00:00.000Z"));
    // Create shared storage
    storage = new MemoryStorage();

    // Create real drive server with the storage
    const builder = new ReactorBuilder(documentModels);
    builder.withStorage(storage);
    driveServer = builder.build() as unknown as BaseDocumentDriveServer;
    await driveServer.initialize();

    // Create event bus and queue
    eventBus = new EventBus();
    queue = new InMemoryQueue(eventBus);

    // Create reactor facade with all required dependencies
    reactor = new Reactor(driveServer, storage, queue);

    // Create mock signer for testing
    const mockSigner: ISigner = {
      sign: () => Promise.resolve(["mock-signature", "", "", "", ""]),
    };

    // Create ReactorClient using the builder
    // The builder will use default subscription manager if not provided
    client = new ReactorClientBuilder()
      .withReactor(reactor)
      .withSigner(mockSigner)
      .build();

    // Add some test documents through the drive server
    // (not using reactor.create since that's now async via jobs)
    const docs = createTestDocuments(5);
    for (const doc of docs) {
      await driveServer.addDocument(doc);
    }
  });

  afterEach(() => {
    // Restore real timers after each test
    vi.useRealTimers();
  });

  describe("getDocumentModels", () => {
    it("should return the same result as reactor.getDocumentModels with all parameters", async () => {
      const namespace = undefined;
      const paging = { cursor: "0", limit: 10 };
      const signal = new AbortController().signal;

      // Get result from reactor
      const reactorResult = await reactor.getDocumentModels(
        namespace,
        paging,
        signal,
      );

      // Get result from client
      const clientResult = await client.getDocumentModels(
        namespace,
        paging,
        signal,
      );

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });

    it("should return the same result as reactor.getDocumentModels with no parameters", async () => {
      // Get result from reactor
      const reactorResult = await reactor.getDocumentModels();

      // Get result from client
      const clientResult = await client.getDocumentModels();

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });

    it("should return the same result with partial parameters", async () => {
      const namespace = "powerhouse";

      // Get result from reactor
      const reactorResult = await reactor.getDocumentModels(namespace);

      // Get result from client
      const clientResult = await client.getDocumentModels(namespace);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });
  });

  describe("find", () => {
    it("should return the same result as reactor.find with all parameters", async () => {
      const search = { type: "powerhouse/document-model" };
      const view = { branch: "main", scopes: ["global"] };
      const paging = { cursor: "0", limit: 20 };
      const signal = new AbortController().signal;

      // Get result from reactor
      const reactorResult = await reactor.find(search, view, paging, signal);

      // Get result from client
      const clientResult = await client.find(search, view, paging, signal);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });

    it("should return the same result as reactor.find with minimal parameters", async () => {
      const search = { ids: ["doc-1", "doc-2"] };

      // Get result from reactor
      const reactorResult = await reactor.find(search);

      // Get result from client
      const clientResult = await client.find(search);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });

    it("should return the same result when searching by parent", async () => {
      const search = { parentId: "parent-123" };
      const view = { branch: "main" };

      // Get result from reactor
      const reactorResult = await reactor.find(search, view);

      // Get result from client
      const clientResult = await client.find(search, view);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });
  });

  describe("get", () => {
    beforeEach(async () => {
      // Create a document with both id and slug
      const docWithSlug = createDocModelDocument();
      docWithSlug.header.id = "doc-with-id-123";
      docWithSlug.header.slug = "my-document-slug";
      await driveServer.addDocument(docWithSlug);
    });

    it("should return the same result as reactor.get when using id", async () => {
      const id = "doc-1";
      const view = { branch: "main" };
      const signal = new AbortController().signal;

      // Get result from reactor
      const reactorResult = await reactor.get(id, view, signal);

      // Get result from client
      const clientResult = await client.get(id, view, signal);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });

    it("should return the same result as reactor.getBySlug when using slug", async () => {
      const slug = "my-document-slug";
      const view = { branch: "main" };
      const signal = new AbortController().signal;

      // Get result from reactor using getBySlug
      const reactorResult = await reactor.getBySlug(slug, view, signal);

      // Get result from client (should automatically detect this is a slug)
      const clientResult = await client.get(slug, view, signal);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });

    it("should return the same result with no optional parameters", async () => {
      const id = "doc-2";

      // Get result from reactor
      const reactorResult = await reactor.get(id);

      // Get result from client
      const clientResult = await client.get(id);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });
  });

  describe("getJobStatus", () => {
    it("should return the same result as reactor.getJobStatus", async () => {
      // First create a job by attempting an operation
      const doc = createDocModelDocument();
      const job = await reactor.create(doc);
      const jobId = job.id;

      // Get result from reactor
      const reactorResult = await reactor.getJobStatus(jobId);

      // Get result from client
      const clientResult = await client.getJobStatus(jobId);

      // These should be equal
      expect(clientResult).toEqual(reactorResult);
    });
  });

  describe("Passthrough functions that modify reactor methods", () => {
    describe("mutate", () => {
      it("should call reactor.mutate", async () => {
        const documentId = "doc-1";
        const actions = [
          {
            id: "action-1",
            type: "SET_NAME",
            timestampUtcMs: "2024-01-01T00:00:00.000Z",
            input: { name: "Modified Name" },
            scope: "global",
          },
        ];

        // Apply mutation through client
        const doc = await client.mutate(documentId, actions);

        const { document: reactorDoc } = await reactor.get(documentId);

        // These should be equal
        expect(doc).toEqual(reactorDoc);
      });
    });

    describe("deleteDocument", () => {
      it("should call reactor.deleteDocument and wait for completion", async () => {
        const id = "doc-1";

        // should be fine
        await reactor.get(id);

        // delete through the client
        await client.deleteDocument(id);

        // now it should throw an error
        await expect(reactor.get(id)).rejects.toThrow();
      });
    });
  });
});
