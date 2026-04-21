import { IdbFs, PGlite } from "pglite-legacy-02";
import { live } from "pglite-legacy-02/live";
import { worker } from "pglite-legacy-02/worker";
import { DEFAULT_RELATIONAL_PROCESSOR_DB_NAME } from "@powerhousedao/shared/processors";

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
