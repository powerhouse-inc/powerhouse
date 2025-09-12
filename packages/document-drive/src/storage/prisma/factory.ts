import { type ICache } from "document-drive";
import { PrismaStorage } from "document-drive/storage/prisma";
import { PrismaClient } from "document-drive/storage/prisma/client";

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
