import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StorageManager } from "../src/storage-manager.js";
import { HypercoreOperationStore } from "../src/hypercore-operation-store.js";

export type TestHypercoreSetup = {
  storage: StorageManager;
  store: HypercoreOperationStore;
  tmpDir: string;
  cleanup: () => Promise<void>;
};

export async function createTestHypercoreStores(): Promise<TestHypercoreSetup> {
  const tmpDir = await mkdtemp(join(tmpdir(), "reactor-hypercore-test-"));
  const storage = new StorageManager(tmpDir);
  await storage.open();

  const store = new HypercoreOperationStore(storage.getBee());

  return {
    storage,
    store,
    tmpDir,
    cleanup: async () => {
      await storage.close();
      await rm(tmpDir, { recursive: true, force: true });
    },
  };
}
