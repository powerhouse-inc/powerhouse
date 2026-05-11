import { type z } from "zod";
import type {
  graphqlDocumentEvents,
  graphqlDocumentsEvents,
} from "./constants.js";
import type {
  GetDocumentOperationsQuery,
  GetDocumentQuery,
  OperationsFilterInput,
  PagingInput,
  Sdk,
  ViewFilterInput,
} from "./gen/schema.js";

type DocumentOperationsPage = GetDocumentOperationsQuery["documentOperations"];

type DocumentResult = NonNullable<GetDocumentQuery["document"]>;

export type ReactorGraphQLClient = Sdk & {
  /** Fetch multiple documentOperations in a single request via aliases. */
  BatchGetDocumentOperations?: (
    filters: OperationsFilterInput[],
    pagings: (PagingInput | undefined | null)[],
  ) => Promise<DocumentOperationsPage[]>;

  /** Fetch a document and multiple documentOperations in a single request. */
  BatchGetDocumentWithOperations?: (
    identifier: string,
    view: ViewFilterInput | undefined,
    filters: OperationsFilterInput[],
    pagings: (PagingInput | undefined)[],
  ) => Promise<{
    document: DocumentResult | null;
    operations: DocumentOperationsPage[];
  }>;
};

export type GraphQLClientDocumentEvent = CustomEvent<{
  identifier: string;
}>;

export type GraphQLClientDocumentsEvent = CustomEvent<{
  identifiers: string[];
}>;

export type GraphQLDocumentEventOperationName =
  (typeof graphqlDocumentEvents)[number];

export type GraphQLDocumentEventsOperationName =
  (typeof graphqlDocumentsEvents)[number];

export type GraphQLDocumentEvents = Record<
  GraphQLDocumentEventOperationName,
  GraphQLClientDocumentEvent
>;

export type GraphQLDocumentsEvents = Record<
  GraphQLDocumentEventsOperationName,
  GraphQLClientDocumentsEvent
>;

export type GraphQLClientWindowEvents = GraphQLDocumentEvents &
  GraphQLDocumentsEvents;

export type TStateSchemaZodObject = z.ZodObject<{
  state: z.ZodObject;
}>;
