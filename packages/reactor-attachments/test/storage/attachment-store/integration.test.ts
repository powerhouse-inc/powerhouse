import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { KyselyAttachmentStore } from "../../../src/storage/kysely/attachment-store.js";
import type { MockTransport } from "../../factories.js";
import {
  createTestAttachmentStore,
  streamFromString,
  streamFromBytes,
  streamToBytes,
  computeHash,
} from "../../factories.js";

describe("KyselyAttachmentStore integration", () => {
  let store: KyselyAttachmentStore;
  let transport: MockTransport;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestAttachmentStore();
    store = setup.store;
    transport = setup.transport;
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  it("full lifecycle: put -> has -> get -> verify bytes -> evict -> has false -> get triggers re-fetch", async () => {
    const content = "lifecycle test content";
    const bytes = new TextEncoder().encode(content);
    const hash = computeHash(bytes);
    const metadata = {
      mimeType: "text/plain",
      fileName: "lifecycle.txt",
      sizeBytes: bytes.byteLength,
      extension: ".txt",
    };

    // put
    await store.put(hash, metadata, streamFromString(content));

    // has
    expect(await store.has(hash)).toBe(true);

    // get + verify bytes
    const response1 = await store.get(hash);
    expect(response1.header.hash).toBe(hash);
    expect(response1.header.status).toBe("available");
    const readBytes = await streamToBytes(response1.body);
    expect(new TextDecoder().decode(readBytes)).toBe(content);

    // evict
    await store.evict(hash);
    expect(await store.has(hash)).toBe(false);

    // get triggers re-fetch via transport
    transport.fetch.mockResolvedValueOnce({
      hash,
      metadata,
      body: streamFromString(content),
    });

    const response2 = await store.get(hash);
    expect(response2.header.status).toBe("available");
    const refetchedBytes = await streamToBytes(response2.body);
    expect(new TextDecoder().decode(refetchedBytes)).toBe(content);
    expect(transport.fetch).toHaveBeenCalledWith(hash, undefined);

    // has should be true again after re-fetch
    expect(await store.has(hash)).toBe(true);
  });

  it("multiple attachments, storageUsed returns correct totals", async () => {
    const items = [
      { content: "first file", fileName: "first.txt" },
      { content: "second file content", fileName: "second.txt" },
      { content: "third", fileName: "third.txt" },
    ];

    let expectedTotal = 0;
    for (const item of items) {
      const bytes = new TextEncoder().encode(item.content);
      const hash = computeHash(bytes);
      const metadata = {
        mimeType: "text/plain",
        fileName: item.fileName,
        sizeBytes: bytes.byteLength,
        extension: ".txt",
      };
      await store.put(hash, metadata, streamFromString(item.content));
      expectedTotal += bytes.byteLength;
    }

    expect(await store.storageUsed()).toBe(expectedTotal);
  });

  it("put same hash twice is idempotent", async () => {
    const content = "idempotent content";
    const bytes = new TextEncoder().encode(content);
    const hash = computeHash(bytes);
    const metadata = {
      mimeType: "text/plain",
      fileName: "idem.txt",
      sizeBytes: bytes.byteLength,
      extension: ".txt",
    };

    await store.put(hash, metadata, streamFromString(content));
    await store.put(hash, metadata, streamFromString(content));

    const response = await store.get(hash);
    const readBytes = await streamToBytes(response.body);
    expect(new TextDecoder().decode(readBytes)).toBe(content);
    expect(await store.storageUsed()).toBe(bytes.byteLength);
  });

  it("large data stream (100KB+) writes and reads correctly", async () => {
    const size = 128 * 1024;
    const largeBytes = new Uint8Array(size);
    for (let i = 0; i < size; i++) {
      largeBytes[i] = i % 256;
    }

    const hash = computeHash(largeBytes);
    const metadata = {
      mimeType: "application/octet-stream",
      fileName: "large.bin",
      sizeBytes: largeBytes.byteLength,
      extension: ".bin",
    };

    await store.put(hash, metadata, streamFromBytes(largeBytes));

    const response = await store.get(hash);
    const readBytes = await streamToBytes(response.body);
    expect(readBytes.byteLength).toBe(size);
    expect(readBytes).toEqual(largeBytes);
  });
});
