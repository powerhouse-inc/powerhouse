import { type DocumentModelModule } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
export const documentModels: DocumentModelModule<any>[] = [
  documentModelDocumentModelModule,
  driveDocumentModelModule,
];
