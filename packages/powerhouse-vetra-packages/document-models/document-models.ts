import { reactorDriveDocumentModelModule } from "@powerhousedao/reactor-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { type DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
export const documentModels: DocumentModelModule<any>[] = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
  reactorDriveDocumentModelModule,
];
