// Under Node 24 a `Blob.stream()` keeps the async context it was made in alive
// for good, which kept every workflow run's whole output on the heap. Nothing
// on the upload path may make one.
import { AsyncLocalStorage } from "node:async_hooks";
import { setFlagsFromString } from "node:v8";
import { runInNewContext } from "node:vm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAttachmentClient } from "../src/client.js";
import { DirectAttachmentUpload } from "../src/direct/direct-attachment-upload.js";
import type { IAttachmentService } from "../src/interfaces.js";
import { createTestDirectUpload } from "./factories.js";

setFlagsFromString("--expose-gc");
const gc = runInNewContext("gc") as () => void;

const CALLS = 20;

async function contextsCollectedAfter(
  call: (index: number) => Promise<unknown>,
): Promise<number> {
  const storage = new AsyncLocalStorage<object>();
  let collected = 0;
  const registry = new FinalizationRegistry(() => {
    collected += 1;
  });
  for (let index = 0; index < CALLS; index++) {
    const store = {};
    registry.register(store, index);
    await storage.run(store, () => call(index));
  }
  for (let turn = 0; turn < 8; turn++) {
    await new Promise((resolve) => setTimeout(resolve, 5));
    gc();
  }
  return collected;
}

describe("the attachment client's upload path", () => {
  let client: ReturnType<typeof createAttachmentClient>;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    const setup = await createTestDirectUpload();
    cleanup = setup.cleanup;
    client = createAttachmentClient({
      reserve: async (options: Parameters<IAttachmentService["reserve"]>[0]) =>
        new DirectAttachmentUpload(
          await setup.reservationStore.create(options),
          setup.db,
          setup.storagePath,
          setup.reservationStore,
        ),
    } as unknown as IAttachmentService);
  });

  afterAll(() => cleanup());

  it("lets go of the caller's async context when hashing", async () => {
    const collected = await contextsCollectedAfter((index) =>
      client.preprocess(new Blob([`hashed ${index}`])),
    );
    expect(collected).toBeGreaterThan(CALLS / 2);
  });

  it("lets go of the caller's async context when writing new bytes", async () => {
    const collected = await contextsCollectedAfter((index) =>
      client.upload({ file: new Blob([`written ${index}`]) }),
    );
    expect(collected).toBeGreaterThan(CALLS / 2);
  });
});
