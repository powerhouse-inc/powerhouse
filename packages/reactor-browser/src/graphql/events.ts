import type {
  GraphQLClientDocumentEvent,
  GraphQLClientDocumentsEvent,
  GraphQLDocumentEventOperationName,
  GraphQLDocumentEventsOperationName,
} from "./types.js";

export function dispatchGraphQLClientDocumentEvent(
  operationName: GraphQLDocumentEventOperationName,
  identifier: string,
) {
  const event: GraphQLClientDocumentEvent = new CustomEvent(operationName, {
    detail: { identifier },
  });
  window.dispatchEvent(event);
}

export function dispatchGraphQLClientDocumentsEvent(
  operationName: GraphQLDocumentEventsOperationName,
  identifiers: string[],
) {
  const event: GraphQLClientDocumentsEvent = new CustomEvent(operationName, {
    detail: { identifiers },
  });
  window.dispatchEvent(event);
}
