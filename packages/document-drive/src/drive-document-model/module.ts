import type { DocumentDriveDocument, DocumentDriveUtils } from "document-drive";
import {
  actions as DocumentDriveActions,
  driveDocumentModel,
  driveDocumentReducer,
  DriveUtils,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { actions as BaseActions } from "document-model";

const utils = { ...DriveUtils } satisfies DocumentDriveUtils;

const actions = { ...BaseActions, ...DocumentDriveActions };

export const driveDocumentModelModule: DocumentModelModule<DocumentDriveDocument> =
  {
    reducer: driveDocumentReducer,
    actions,
    utils,
    documentModel: driveDocumentModel,
  };
