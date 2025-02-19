/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { DocumentModelModule } from "document-model";
import { AccountSnapshotAction } from "./gen/actions.js";
import {
  documentModelName,
  documentType,
  fileExtension,
} from "./gen/constants.js";
import { actions, documentModelState } from "./gen/index.js";
import { reducer } from "./gen/reducer.js";
import {
  AccountSnapshotLocalState,
  AccountSnapshotState,
} from "./gen/types.js";
import * as genUtils from "./gen/utils.js";
import * as customUtils from "./src/utils.js";

export const accountSnapshotDocumentModelModule: DocumentModelModule<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = {
  documentType,
  documentModelName,
  fileExtension,
  documentModelState,
  reducer,
  actions,
  utils: { ...genUtils, ...customUtils },
};
