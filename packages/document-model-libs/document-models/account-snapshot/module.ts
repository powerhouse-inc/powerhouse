/**
 * This is a scaffold file meant for customization.
 * Delete the file and run the code generator again to have it reset
 */

import { DocumentModelModule } from "document-model";
import { AccountSnapshotAction } from "./gen/actions.js";
import { actions } from "./gen/index.js";
import { reducer } from "./gen/reducer.js";
import {
  AccountSnapshotState,
  AccountSnapshotLocalState,
} from "./gen/types.js";
import * as customUtils from "./src/utils.js";
import * as genUtils from "./gen/utils.js";
import { fileExtension } from "./gen/constants.js";
import { initialGlobalState } from "./gen/utils.js";

export const documentModelModule: DocumentModelModule<
  AccountSnapshotState,
  AccountSnapshotLocalState,
  AccountSnapshotAction
> = {
  reducer,
  actions,
  initialGlobalState,
  utils: { ...genUtils, ...customUtils, fileExtension },
};
