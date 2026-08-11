import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { ReactorGroupV1 } from "@powerhousedao/reactor-group";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { type DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
export const documentModels: DocumentModelModule<any>[] = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
  reactorDriveDocumentModelModule,
  ReactorGroupV1 as unknown as DocumentModelModule<any>,
];
