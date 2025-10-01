import type { LoadFromInput, SaveToFileHandle } from "document-model";
import { baseLoadFromInput, baseSaveToFileHandle } from "document-model/core";
import { documentModelReducer } from "./reducers.js";
import type { DocumentModelPHState } from "./types.js";

export const documentModelSaveToFileHandle: SaveToFileHandle = (
  document,
  input,
) => {
  return baseSaveToFileHandle(document, input);
};

export const documentModelLoadFromInput: LoadFromInput<DocumentModelPHState> = (
  input,
) => {
  return baseLoadFromInput(input, documentModelReducer);
};
