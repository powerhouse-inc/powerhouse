import { IdbFs, PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { worker } from "@electric-sql/pglite/worker";

worker({
  async init(options) {
    // const databaseName =
    //   process.env.PH_CONNECT_ANALYTICS_DATABASE_NAME ??
    //   "http://localhost:5173" + ":analytics";

    // const idbFs: IdbFs = new IdbFs(databaseName);
    // Create and return a PGlite instance
    // const db = PGlite.create({
    //   // fs: idbFs,
    //   relaxedDurability: true,
    //   extensions: {
    //     live,
    //   },
    // });

    // return db;
    return new PGlite("idb://my-db", options);
  },
}).catch((error: unknown) => {
  console.error("Error initializing PGlite worker:", error);
  throw error;
});
