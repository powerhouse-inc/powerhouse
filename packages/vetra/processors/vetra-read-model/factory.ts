import type { ProcessorRecord } from "@powerhousedao/reactor";
import type { IProcessorHostModule } from "document-drive";
import type { PHDocumentHeader } from "document-model";
import type { Kysely } from "kysely";
import { VetraReadModelProcessor } from "./index.js";
import type { DB } from "./schema.js";

export const vetraReadModelProcessorFactory =
  (module: IProcessorHostModule) =>
  async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    // Cast to Kysely<DB> - the relationalDb should have the correct schema
    const db = module.relationalDb as unknown as Kysely<DB>;

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
