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

export type ReactorGraphQLClient = Pick<
  Sdk,
  | "GetDocument"
  | "GetDocumentWithOperations"
  | "GetDocumentOperations"
  | "MutateDocument"
  | "CreateDocument"
  | "CreateEmptyDocument"
  | "DeleteDocument"
> & {
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
