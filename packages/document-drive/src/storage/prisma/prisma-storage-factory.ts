import { PrismaStorage } from "#storage/prisma/prisma";
import Prisma from "@prisma/client";
const PrismaClient = Prisma.PrismaClient;

export class PrismaStorageFactory {
  private prisma: InstanceType<typeof PrismaClient>;

  constructor(private readonly dbUrl: string) {
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.dbUrl,
        },
      },
    });
  }

  async create() {
    return new PrismaStorage(this.prisma);
  }
}
