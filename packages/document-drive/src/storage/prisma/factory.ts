import { ICache } from "#cache/types";
import { PrismaStorage } from "#storage/prisma/index";
import Prisma from "@prisma/client";
const PrismaClient = Prisma.PrismaClient;

export class PrismaStorageFactory {
  private readonly prisma: InstanceType<typeof PrismaClient>;
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
