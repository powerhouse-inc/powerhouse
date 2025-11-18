import { createState } from "document-model";
import { defaultBaseState } from "document-model/core";
import { driveDocumentFileExtension } from "./constants.js";
import * as actions from "./gen/creators.js";
import { driveDocumentModel } from "./gen/document-model.js";
import { driveDocumentReducer } from "./gen/reducer.js";
import {
  assertIsDocumentOfType,
  assertIsStateOfType,
  driveCreateDocument,
  driveCreateState,
  driveLoadFromInput,
  driveSaveToFileHandle,
  isDocumentOfType,
  isStateOfType,
} from "./gen/utils.js";
import type { DriveDocumentModelModule } from "./types.js";
export const driveDocumentModelModule: DriveDocumentModelModule = {
  actions,
  reducer: driveDocumentReducer,
  documentModel: createState(defaultBaseState(), driveDocumentModel),
  utils: {
    fileExtension: driveDocumentFileExtension,
    createState: driveCreateState,
    createDocument: driveCreateDocument,
    loadFromInput: driveLoadFromInput,
    saveToFileHandle: driveSaveToFileHandle,
    isStateOfType,
    assertIsStateOfType,
    isDocumentOfType,
    assertIsDocumentOfType,
  },
};
