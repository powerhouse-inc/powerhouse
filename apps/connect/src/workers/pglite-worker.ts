import type {
  IdbFs,
  PGliteWorkerOptions,
} from "@powerhousedao/reactor-browser";
import { live, worker } from "@powerhousedao/reactor-browser";

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

    const { IdbFs, PGlite } = await import("@powerhousedao/reactor-browser");

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
