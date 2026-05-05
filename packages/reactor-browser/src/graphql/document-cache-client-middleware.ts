import { isIncludedIn, isStrictEqual } from "remeda";
import { identifierFromMutateDocumentOperationVariables } from "./adapters.js";
import { graphqlEventsToSyncDrive } from "./constants.js";
import { dispatchGraphQLClientDocumentEvent } from "./events.js";
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

  if (isStrictEqual(operationName, "MutateDocument")) {
    dispatchGraphQLClientDocumentEvent(
      operationName,
      identifierFromMutateDocumentOperationVariables(variables),
    );
  }

  return result;
};
