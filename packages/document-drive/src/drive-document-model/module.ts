import type { DriveDocumentModelModule } from "document-drive";
import {
  driveCreateDocument,
  driveCreateState,
  driveDocumentFileExtension,
  driveDocumentModel,
  driveDocumentReducer,
  driveLoadFromInput,
  driveSaveToFileHandle,
} from "document-drive";
import * as actions from "./gen/creators.js";

export const driveDocumentModelModule: DriveDocumentModelModule = {
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
