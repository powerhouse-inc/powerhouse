import { IdbFs, PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { worker } from "@electric-sql/pglite/worker";
import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";

worker({
  init() {
    const idbFs = new IdbFs(DEFAULT_RELATIONAL_PROCESSOR_DB_NAME);
    return Promise.resolve(
      new PGlite({
        fs: idbFs,
        relaxedDurability: true,
        extensions: { live },
      }),
    );
  },
}).catch(console.error);
