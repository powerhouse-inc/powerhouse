import { PrismaStorage } from "#storage/prisma/index";
import { IOperationsCache } from "#storage/types";
import Prisma from "@prisma/client";
const PrismaClient = Prisma.PrismaClient;

export class PrismaStorageFactory {
  private readonly prisma: InstanceType<typeof PrismaClient>;
  private readonly cache: IOperationsCache;

  constructor(dbUrl: string, cache: IOperationsCache) {
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
