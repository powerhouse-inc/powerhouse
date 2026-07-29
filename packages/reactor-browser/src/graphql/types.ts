import type { RequestDocument, Variables } from "graphql-request";
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

/** Arguments for running a hand-authored GraphQL document through the SDK. */
export type RunDocumentOptions = {
  /** Operation name reported to the middleware (auth, logging, tracing). */
  operationName: string;

  /** Operation type reported to the middleware. Defaults to `"query"`. */
  operationType?: string;

  /** The document to run: a source string or a parsed `DocumentNode`. */
  document: RequestDocument;

  variables?: Variables;
  requestHeaders?: Record<string, string>;
  signal?: RequestInit["signal"];
};

export type ReactorGraphQLClient = Sdk & {
  /**
   * Run a hand-authored GraphQL document through the same transport and
   * middleware as the generated SDK methods. Used for selections the code
   * generator cannot express, such as a mutation that also returns the
   * operations it produced.
   */
  RunDocument: <TData>(options: RunDocumentOptions) => Promise<TData>;

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
