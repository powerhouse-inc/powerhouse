import type {
  IProcessorHostModule,
  ProcessorRecord,
} from "@powerhousedao/reactor";
import type { IRelationalDb } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import { VetraReadModelProcessor } from "./index.js";
import { up } from "./migrations.js";
import type { DB } from "./schema.js";

export const vetraReadModelProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    // Create namespace (same as legacy - all vetra packages share one namespace)
    const db = await module.relationalDb.createNamespace<DB>("vetra-packages");

    // Run migrations (idempotent - uses ifNotExists)
    await up(db as IRelationalDb<DB>);

    // Create the processor with the relational database
    const processor = new VetraReadModelProcessor(db);
    return [
      {
        processor,
        filter: {
          branch: ["main"],
          documentId: ["*"],
          documentType: ["powerhouse/package"],
          scope: ["global"],
        },
      },
    ];
  };
