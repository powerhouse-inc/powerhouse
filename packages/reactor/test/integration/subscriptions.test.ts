import type { DocumentDriveDocument } from "document-drive";
import { driveDocumentModelModule, MemoryStorage } from "document-drive";
import type { DocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DocumentChangeEvent } from "../../src/client/types.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import type { ReactorClientModule } from "../../src/core/types.js";
import { JobStatus } from "../../src/shared/types.js";

/**
 * Integration tests for ReactorClient subscriptions.
 *
 * These tests verify that when operations are executed via the reactor,
 * subscription callbacks registered via ReactorClient.subscribe() are invoked.
 *
 * Initial state: These tests should FAIL because the notification bridge
 * between OPERATIONS_READY events and the subscription manager is missing.
 */
describe("ReactorClient Subscription Integration Tests", () => {
  let module: ReactorClientModule;
  let storage: MemoryStorage;

  async function waitForJobCompletion(jobId: string): Promise<void> {
    await vi.waitUntil(
      async () => {
        const status = await module.reactor.getJobStatus(jobId);
        if (status.status === JobStatus.FAILED) {
          throw new Error(`Job failed: ${status.error?.message ?? "unknown"}`);
        }
        return status.status === JobStatus.READ_MODELS_READY;
      },
      { timeout: 5000 },
    );
  }

  beforeEach(async () => {
    storage = new MemoryStorage();

    const reactorBuilder = new ReactorBuilder()
      .withDocumentModels([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ])
      .withLegacyStorage(storage)
      .withFeatures({ legacyStorageEnabled: true });

    module = await new ReactorClientBuilder()
      .withReactorBuilder(reactorBuilder)
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  describe("Document Creation Subscriptions", () => {
    it("should notify subscriber when document is created", async () => {
      const eventReceived = vi.fn();

      const unsubscribe = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        eventReceived,
      );

      const document = driveDocumentModelModule.utils.createDocument();
      const jobInfo = await module.reactor.create(document);

      await waitForJobCompletion(jobInfo.id);

      expect(eventReceived).toHaveBeenCalled();
      const event = eventReceived.mock.calls[0][0] as DocumentChangeEvent;
      expect(event.documents).toHaveLength(1);

      unsubscribe();
    });

    it("should filter notifications by document type", async () => {
      const driveCallback = vi.fn();
      const otherCallback = vi.fn();

      const unsubscribeDrive = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        driveCallback,
      );

      const unsubscribeOther = module.client.subscribe(
        { type: "powerhouse/other-type" },
        otherCallback,
      );

      const document = driveDocumentModelModule.utils.createDocument();
      const jobInfo = await module.reactor.create(document);

      await waitForJobCompletion(jobInfo.id);

      expect(driveCallback).toHaveBeenCalled();
      expect(otherCallback).not.toHaveBeenCalled();

      unsubscribeDrive();
      unsubscribeOther();
    });
  });

  describe("Multiple Subscribers", () => {
    it("should notify all matching subscribers for same event", async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const callback3 = vi.fn();

      const unsub1 = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        callback1,
      );
      const unsub2 = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        callback2,
      );
      const unsub3 = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        callback3,
      );

      const document = driveDocumentModelModule.utils.createDocument();
      const jobInfo = await module.reactor.create(document);

      await waitForJobCompletion(jobInfo.id);

      expect(callback1).toHaveBeenCalled();
      expect(callback2).toHaveBeenCalled();
      expect(callback3).toHaveBeenCalled();

      unsub1();
      unsub2();
      unsub3();
    });
  });

  describe("Unsubscribe Behavior", () => {
    it("should stop notifications after unsubscribe", async () => {
      const callback = vi.fn();

      const unsubscribe = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        callback,
      );

      const document1 = driveDocumentModelModule.utils.createDocument();
      const job1 = await module.reactor.create(document1);
      await waitForJobCompletion(job1.id);

      const callCountAfterFirst = callback.mock.calls.length;

      unsubscribe();

      const document2 = driveDocumentModelModule.utils.createDocument();
      const job2 = await module.reactor.create(document2);
      await waitForJobCompletion(job2.id);

      expect(callback.mock.calls.length).toBe(callCountAfterFirst);
    });
  });

  describe("Consistency Guarantees", () => {
    it("should have fresh data when callback fires (reactor.get works)", async () => {
      let documentFromCallback: DocumentDriveDocument | undefined;

      const unsubscribe = module.client.subscribe(
        { type: "powerhouse/document-drive" },
        (event) => {
          if (event.documents.length > 0) {
            documentFromCallback = event.documents[0] as DocumentDriveDocument;
          }
        },
      );

      const document = driveDocumentModelModule.utils.createDocument();
      const jobInfo = await module.reactor.create(document);

      await waitForJobCompletion(jobInfo.id);

      await vi.waitUntil(() => documentFromCallback !== undefined, {
        timeout: 2000,
      });

      expect(documentFromCallback).toBeDefined();
      expect(documentFromCallback?.header.id).toBe(document.header.id);
      expect(documentFromCallback?.header.documentType).toBe(
        "powerhouse/document-drive",
      );

      unsubscribe();
    });
  });
});
