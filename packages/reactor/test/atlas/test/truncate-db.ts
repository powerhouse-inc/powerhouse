import type { PrismaClient } from "document-drive/storage/prisma/client";

export async function truncateAllTables(
  prismaClient: PrismaClient,
): Promise<void> {
  await prismaClient.$executeRawUnsafe('TRUNCATE TABLE "Attachment" CASCADE;');
  await prismaClient.$executeRawUnsafe(
    'TRUNCATE TABLE "SynchronizationUnit" CASCADE;',
  );
  await prismaClient.$executeRawUnsafe('TRUNCATE TABLE "Operation" CASCADE;');
  await prismaClient.$executeRawUnsafe(
    'TRUNCATE TABLE "DriveDocument" CASCADE;',
  );
  await prismaClient.$executeRawUnsafe('TRUNCATE TABLE "Document" CASCADE;');
  await prismaClient.$executeRawUnsafe('TRUNCATE TABLE "Drive" CASCADE;');
}

export async function truncateNewReactorTables(
  prismaClient: PrismaClient,
): Promise<void> {
  const tables = [
    "ViewState",
    "SlugMapping",
    "DocumentSnapshot",
    "IndexerState",
    "DocumentRelationship",
    "Document",
    "Keyframe",
    "Operation",
  ];

  for (const table of tables) {
    try {
      await prismaClient.$executeRawUnsafe(
        `TRUNCATE TABLE "${table}" CASCADE;`,
      );
    } catch {
      // Table might not exist, continue
    }
  }
}
