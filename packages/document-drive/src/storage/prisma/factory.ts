import { PrismaStorage } from "#storage/prisma/index";
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

  build() {
    return new PrismaStorage(this.prisma);
  }
}
