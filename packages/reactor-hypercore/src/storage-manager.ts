import Corestore from "corestore";
import Hyperbee from "hyperbee";

export class StorageManager {
  private store: Corestore;
  private bee: Hyperbee | undefined;

  constructor(storagePath: string) {
    this.store = new Corestore(storagePath);
  }

  async open(): Promise<void> {
    await this.store.ready();
    const core = this.store.get({ name: "operations" });
    this.bee = new Hyperbee(core, {
      keyEncoding: "utf-8",
      valueEncoding: "json",
    });
    await this.bee.ready();
  }

  async close(): Promise<void> {
    if (this.bee) {
      await this.bee.close();
    }
    await this.store.close();
  }

  getBee(): Hyperbee {
    if (!this.bee) {
      throw new Error("StorageManager not opened. Call open() first.");
    }
    return this.bee;
  }
}
