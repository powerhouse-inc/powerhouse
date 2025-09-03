import { IdbFs, PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import type { PGliteWorkerOptions } from "@electric-sql/pglite/worker";
import { worker } from "@electric-sql/pglite/worker";

interface PGLiteWorkerOptions extends PGliteWorkerOptions {
  meta: {
    databaseName: string;
  };
}

worker({
  async init(options) {
    const databaseName = (options as PGLiteWorkerOptions).meta.databaseName;
    if (!databaseName) {
      throw new Error("Database name not provided");
    }

    const idbFs: IdbFs = new IdbFs(databaseName);
    // Create and return a PGlite instance
    const db = PGlite.create({
      fs: idbFs,
      relaxedDurability: true,
      extensions: {
        live,
      },
    });

    return db;
  },
}).catch((error: unknown) => {
  console.error("Error initializing PGlite worker:", error);
  throw error;
});
