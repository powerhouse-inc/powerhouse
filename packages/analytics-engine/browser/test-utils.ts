export async function createFsPglite(databaseName: string) {
  const { IdbFs, PGlite } = await import("@electric-sql/pglite");
  return await PGlite.create({
    fs: new IdbFs(databaseName),
    relaxedDurability: true,
  });
}
