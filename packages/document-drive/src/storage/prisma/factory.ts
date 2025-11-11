import type { ICache } from "document-drive";
import { PrismaClient } from "./client/index.js";
import { PrismaStorage } from "./prisma.js";
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

  checkConnection() {
    return this.prisma.$queryRaw`SELECT 1`;
  }

  build() {
    return new PrismaStorage(this.prisma, this.cache);
  }
}
