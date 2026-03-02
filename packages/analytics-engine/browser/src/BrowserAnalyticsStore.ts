import {
  MemoryAnalyticsStore,
  type MemoryAnalyticsStoreOptions,
} from "./MemoryAnalyticsStore.js";
import { IdbFs, PGlite } from "@electric-sql/pglite";

export type BrowserAnalyticsStoreOptions = MemoryAnalyticsStoreOptions & {
  databaseName: string;
};

export class BrowserAnalyticsStore extends MemoryAnalyticsStore {
  constructor(
    options: BrowserAnalyticsStoreOptions = { databaseName: "analytics" },
  ) {
    if (!options.pgLiteFactory) {
      options.pgLiteFactory = async () =>
        PGlite.create({
          fs: new IdbFs(options.databaseName),
          relaxedDurability: true,
        });
    }

    super(options);
  }
}
