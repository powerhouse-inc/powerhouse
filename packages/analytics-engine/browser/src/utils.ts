import { IdbFs, PGlite } from "@electric-sql/pglite";

export async function createFsPglite(databaseName: string) {
  return await PGlite.create({
    fs: new IdbFs(databaseName),
    relaxedDurability: true,
  });
}
