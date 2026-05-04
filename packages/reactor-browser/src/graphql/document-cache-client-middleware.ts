import { isIncludedIn, isStrictEqual } from "remeda";
import {
  identifierFromDeleteDocumentOperationVariables,
  identifiersFromDeleteDocumentsOperationVariables,
} from "./adapters.js";
import { graphqlEventsToSyncDrive } from "./constants.js";
import {
  dispatchGraphQLClientDocumentEvent,
  dispatchGraphQLClientDocumentsEvent,
} from "./events.js";
import type { SdkFunctionWrapper } from "./gen/schema.js";

export const documentCacheClientMiddleware: SdkFunctionWrapper = async (
  action,
  operationName,
  operationType,
  variables: unknown,
) => {
  console.log({ operationName, operationType, variables });
  const result = await action();

  if (isIncludedIn(operationName, graphqlEventsToSyncDrive)) {
    window.dispatchEvent(new CustomEvent(operationName));
  }

  if (
    isStrictEqual(operationName, "MutateDocument") ||
    isStrictEqual(operationName, "MutateDocumentAsync")
  ) {
    dispatchGraphQLClientDocumentEvent(
      operationName,
      identifierFromDeleteDocumentOperationVariables(variables),
    );
  }

  if (isStrictEqual(operationName, "DeleteDocument")) {
    dispatchGraphQLClientDocumentEvent(
      operationName,
      identifierFromDeleteDocumentOperationVariables(variables),
    );
  }

  if (isStrictEqual(operationName, "DeleteDocuments")) {
    dispatchGraphQLClientDocumentsEvent(
      operationName,
      identifiersFromDeleteDocumentsOperationVariables(variables),
    );
  }

  return result;
};
