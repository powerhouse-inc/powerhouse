import type { DocumentDriveDocument } from "document-drive";
import {
  driveCreateDocument,
  driveCreateState,
  driveDocumentFileExtension,
  driveDocumentModel,
  driveDocumentReducer,
  driveLoadFromInput,
  driveSaveToFileHandle,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import * as actions from "./gen/creators.js";

export const driveDocumentModelModule: DocumentModelModule<DocumentDriveDocument> =
  {
    actions,
    reducer: driveDocumentReducer,
    documentModel: driveDocumentModel,
    utils: {
      fileExtension: driveDocumentFileExtension,
      createState: driveCreateState,
      createDocument: driveCreateDocument,
      loadFromInput: driveLoadFromInput,
      saveToFileHandle: driveSaveToFileHandle,
    },
  };
