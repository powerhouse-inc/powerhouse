import { IdbFs, PGlite } from "pglite-legacy-02";
import { live } from "pglite-legacy-02/live";
import { worker } from "pglite-legacy-02/worker";
import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";

worker({
  init(options) {
    // dbName carries the origin-scoped storage namespace from the main thread.
    const dbName =
      (options.meta as { dbName?: string } | undefined)?.dbName ??
      DEFAULT_RELATIONAL_PROCESSOR_DB_NAME;
    const idbFs = new IdbFs(dbName);
    return Promise.resolve(
      new PGlite({
        fs: idbFs,
        relaxedDurability: true,
        extensions: { live },
      }),
    );
  },
}).catch(console.error);
