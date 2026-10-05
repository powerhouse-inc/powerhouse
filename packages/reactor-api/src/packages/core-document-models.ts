import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { ReactorGroupV1 } from "@powerhousedao/reactor-group";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";

/**
 * The document models a host loads before any package, keyed by the name the
 * package manager registers them under. Subgraph validation builds against the
 * same list, so a subgraph that names `DocumentDrive` validates as it serves.
 */
export const CORE_DOCUMENT_MODEL_MODULES: Readonly<
  Record<string, DocumentModelModule>
> = {
  "document-drive": driveDocumentModelModule as unknown as DocumentModelModule,
  "document-model":
    documentModelDocumentModelModule as unknown as DocumentModelModule,
  "reactor-drive":
    reactorDriveDocumentModelModule as unknown as DocumentModelModule,
  "reactor-group": ReactorGroupV1 as unknown as DocumentModelModule,
};
