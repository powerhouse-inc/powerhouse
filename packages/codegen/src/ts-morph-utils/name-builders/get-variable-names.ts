import type {
  DocumentModelDocumentTypeMetadata,
  EditorVariableNames,
} from "../types.js";
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

export function getEditorVariableNames({
  documentModelDocumentTypeName,
}: DocumentModelDocumentTypeMetadata): EditorVariableNames {
  return {
    documentVariableName: buildDocumentVariableName(
      documentModelDocumentTypeName,
    ),
    editDocumentNameComponentName: buildEditDocumentNameComponentName(
      documentModelDocumentTypeName,
    ),
    useSelectedDocumentHookName: buildUseSelectedDocumentHookName(
      documentModelDocumentTypeName,
    ),
    documentNameVariableName: buildDocumentNameVariableName(
      documentModelDocumentTypeName,
    ),
    dispatchFunctionName: buildDispatchFunctionName(
      documentModelDocumentTypeName,
    ),
    onClickEditHandlerName: buildOnClickHandlerName(
      documentModelDocumentTypeName,
    ),
    onCancelEditHandlerName: buildOnCancelEditHandlerName(
      documentModelDocumentTypeName,
    ),
    setNameActionName: buildSetNameActionName(documentModelDocumentTypeName),
    isEditingVariableName: buildIsEditingVariableName(
      documentModelDocumentTypeName,
    ),
    setIsEditingFunctionName: buildSetIsEditingFunctionName(
      documentModelDocumentTypeName,
    ),
    onSubmitSetNameFunctionName: buildOnSubmitSetNameFunctionName(
      documentModelDocumentTypeName,
    ),
  };
}
