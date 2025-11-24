import { camelCase } from "change-case";

export function buildDocumentVariableName(documentTypeName: string) {
  return camelCase(documentTypeName);
}

export function buildEditDocumentNameComponentName(documentTypeName: string) {
  return `Edit${documentTypeName}Name`;
}

export function buildDocumentNameVariableName(documentTypeName: string) {
  return `${documentTypeName}Name`;
}

export function buildUseSelectedDocumentHookName(documentTypeName: string) {
  return `useSelected${documentTypeName}`;
}

export function buildDispatchFunctionName(documentTypeName: string) {
  return "dispatch";
}

export function buildOnClickHandlerName(documentTypeName: string) {
  return `onClickEdit${documentTypeName}Name`;
}

export function buildOnCancelEditHandlerName(documentTypeName: string) {
  return `onClickCancelEdit${documentTypeName}Name`;
}

export function buildSetNameActionName(documentTypeName: string) {
  return "setName";
}

export function buildIsEditingVariableName(documentTypeName: string) {
  return "isEditing";
}

export function buildSetIsEditingFunctionName(documentTypeName: string) {
  return "setIsEditing";
}

export function buildOnSubmitSetNameFunctionName(documentTypeName: string) {
  return `onSubmitSet${documentTypeName}Name`;
}
