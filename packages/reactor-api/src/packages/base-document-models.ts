import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { ReactorGroupV1 } from "@powerhousedao/reactor-group";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";

/** The models every host loads before any package's, by source package. */
export const baseDocumentModels: ReadonlyArray<
  readonly [string, DocumentModelModule]
> = [
  [
    "document-drive",
    driveDocumentModelModule as unknown as DocumentModelModule,
  ],
  [
    "document-model",
    documentModelDocumentModelModule as unknown as DocumentModelModule,
  ],
  [
    "reactor-drive",
    reactorDriveDocumentModelModule as unknown as DocumentModelModule,
  ],
  ["reactor-group", ReactorGroupV1 as unknown as DocumentModelModule],
];
