import type { EditorVariableNames } from "../types.js";
import {
  buildDispatchFunctionName,
  buildDocumentNameVariableName,
  buildDocumentVariableName,
  buildEditDocumentNameComponentName,
  buildIsEditingVariableName,
  buildOnCancelEditHandlerName,
  buildOnClickHandlerName,
  buildOnSubmitSetNameFunctionName,
  buildSetIsEditingFunctionName,
  buildSetNameActionName,
  buildUseSelectedDocumentHookName,
} from "./variables.js";

export function getEditorVariableNames(
  documentTypeName: string,
): EditorVariableNames {
  return {
    documentVariableName: buildDocumentVariableName(documentTypeName),
    editDocumentNameComponentName:
      buildEditDocumentNameComponentName(documentTypeName),
    useSelectedDocumentHookName:
      buildUseSelectedDocumentHookName(documentTypeName),
    documentNameVariableName: buildDocumentNameVariableName(documentTypeName),
    dispatchFunctionName: buildDispatchFunctionName(documentTypeName),
    onClickEditHandlerName: buildOnClickHandlerName(documentTypeName),
    onCancelEditHandlerName: buildOnCancelEditHandlerName(documentTypeName),
    setNameActionName: buildSetNameActionName(documentTypeName),
    isEditingVariableName: buildIsEditingVariableName(documentTypeName),
    setIsEditingFunctionName: buildSetIsEditingFunctionName(documentTypeName),
    onSubmitSetNameFunctionName:
      buildOnSubmitSetNameFunctionName(documentTypeName),
  };
}
