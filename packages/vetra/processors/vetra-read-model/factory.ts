import type {
  IProcessorHostModule,
  ProcessorFactoryBuilder,
  ProcessorRecord,
} from "@powerhousedao/reactor-browser";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import { up } from "./migrations.js";
import { VetraReadModelProcessor } from "./processor.js";
import type { DB } from "./schema.js";

export const vetraReadModelFactoryBuilder: ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => {
  return async (driveHeader: PHDocumentHeader): Promise<ProcessorRecord[]> => {
    // Create namespace (same as legacy - all vetra packages share one namespace)
    const db = await module.relationalDb.createNamespace<DB>("vetra-packages");

    // Run migrations (idempotent - uses ifNotExists)
    await up(db);

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
};
