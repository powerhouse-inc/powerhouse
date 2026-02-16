import { IdbFs, PGlite } from "@electric-sql/pglite";
import { live } from "@electric-sql/pglite/live";
import { worker } from "@electric-sql/pglite/worker";
import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "shared/processors";

worker({
  async init() {
    const idbFs = new IdbFs(DEFAULT_RELATIONAL_PROCESSOR_DB_NAME);
    return new PGlite({
      fs: idbFs,
      relaxedDurability: true,
      extensions: { live },
    });
  },
}).catch(console.error);
