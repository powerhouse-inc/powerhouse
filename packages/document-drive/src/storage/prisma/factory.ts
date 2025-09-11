import type { ICache } from "#cache/types";
import { PrismaStorage } from "#storage/prisma/prisma";
import { PrismaClient } from "./client/index.js";

export class PrismaStorageFactory {
  private readonly prisma: PrismaClient;
  private readonly cache: ICache;

  constructor(dbUrl: string, cache: ICache) {
    this.cache = cache;
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: dbUrl,
        },
      },
    });
  }

  build() {
    return new PrismaStorage(this.prisma, this.cache);
  }
}
