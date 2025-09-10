import { gql } from "graphql-tag";

// Fragment for common PHDocument fields
export const PHDocumentFieldsFragment = gql`
  fragment PHDocumentFields on PHDocument {
    id
    slug
    name
    documentType
    state
    revision
    created
    lastModified
    parentId
  }
`;

// Query operations
export const GetDocumentModelsDocument = gql`
  query GetDocumentModels($namespace: String, $paging: PagingInput) {
    documentModels(namespace: $namespace, paging: $paging) {
      items {
        id
        name
        namespace
        version
        specification
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
`;

export const GetDocumentDocument = gql`
  ${PHDocumentFieldsFragment}
  query GetDocument($identifier: String!, $view: ViewFilterInput) {
    document(identifier: $identifier, view: $view) {
      document {
        ...PHDocumentFields
      }
      childIds
    }
  }
`;

export const GetDocumentChildrenDocument = gql`
  ${PHDocumentFieldsFragment}
  query GetDocumentChildren(
    $parentIdentifier: String!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    documentChildren(
      parentIdentifier: $parentIdentifier
      view: $view
      paging: $paging
    ) {
      items {
        ...PHDocumentFields
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
`;

export const GetDocumentParentsDocument = gql`
  ${PHDocumentFieldsFragment}
  query GetDocumentParents(
    $childIdentifier: String!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    documentParents(
      childIdentifier: $childIdentifier
      view: $view
      paging: $paging
    ) {
      items {
        ...PHDocumentFields
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
`;

export const FindDocumentsDocument = gql`
  ${PHDocumentFieldsFragment}
  query FindDocuments(
    $search: SearchFilterInput!
    $view: ViewFilterInput
    $paging: PagingInput
  ) {
    findDocuments(search: $search, view: $view, paging: $paging) {
      items {
        ...PHDocumentFields
      }
      totalCount
      hasNextPage
      hasPreviousPage
      cursor
    }
  }
`;

export const GetJobStatusDocument = gql`
  query GetJobStatus($jobId: String!) {
    jobStatus(jobId: $jobId) {
      id
      status
      result
      error
      createdAt
      completedAt
    }
  }
`;

// Mutation operations
export const CreateDocumentDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation CreateDocument($document: JSONObject!, $parentIdentifier: String) {
    createDocument(document: $document, parentIdentifier: $parentIdentifier) {
      ...PHDocumentFields
    }
  }
`;

export const CreateEmptyDocumentDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation CreateEmptyDocument(
    $documentType: String!
    $parentIdentifier: String
  ) {
    createEmptyDocument(
      documentType: $documentType
      parentIdentifier: $parentIdentifier
    ) {
      ...PHDocumentFields
    }
  }
`;

export const MutateDocumentDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation MutateDocument(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
    $view: ViewFilterInput
  ) {
    mutateDocument(
      documentIdentifier: $documentIdentifier
      actions: $actions
      view: $view
    ) {
      ...PHDocumentFields
    }
  }
`;

export const MutateDocumentAsyncDocument = gql`
  mutation MutateDocumentAsync(
    $documentIdentifier: String!
    $actions: [JSONObject!]!
    $view: ViewFilterInput
  ) {
    mutateDocumentAsync(
      documentIdentifier: $documentIdentifier
      actions: $actions
      view: $view
    )
  }
`;

export const RenameDocumentDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation RenameDocument(
    $documentIdentifier: String!
    $name: String!
    $view: ViewFilterInput
  ) {
    renameDocument(
      documentIdentifier: $documentIdentifier
      name: $name
      view: $view
    ) {
      ...PHDocumentFields
    }
  }
`;

export const AddChildrenDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation AddChildren(
    $parentIdentifier: String!
    $documentIdentifiers: [String!]!
    $view: ViewFilterInput
  ) {
    addChildren(
      parentIdentifier: $parentIdentifier
      documentIdentifiers: $documentIdentifiers
      view: $view
    ) {
      ...PHDocumentFields
    }
  }
`;

export const RemoveChildrenDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation RemoveChildren(
    $parentIdentifier: String!
    $documentIdentifiers: [String!]!
    $view: ViewFilterInput
  ) {
    removeChildren(
      parentIdentifier: $parentIdentifier
      documentIdentifiers: $documentIdentifiers
      view: $view
    ) {
      ...PHDocumentFields
    }
  }
`;

export const MoveChildrenDocument = gql`
  ${PHDocumentFieldsFragment}
  mutation MoveChildren(
    $sourceParentIdentifier: String!
    $targetParentIdentifier: String!
    $documentIdentifiers: [String!]!
    $view: ViewFilterInput
  ) {
    moveChildren(
      sourceParentIdentifier: $sourceParentIdentifier
      targetParentIdentifier: $targetParentIdentifier
      documentIdentifiers: $documentIdentifiers
      view: $view
    ) {
      source {
        ...PHDocumentFields
      }
      target {
        ...PHDocumentFields
      }
    }
  }
`;

export const DeleteDocumentDocument = gql`
  mutation DeleteDocument($identifier: String!, $propagate: PropagationMode) {
    deleteDocument(identifier: $identifier, propagate: $propagate)
  }
`;

export const DeleteDocumentsDocument = gql`
  mutation DeleteDocuments(
    $identifiers: [String!]!
    $propagate: PropagationMode
  ) {
    deleteDocuments(identifiers: $identifiers, propagate: $propagate)
  }
`;

// Subscription operations
export const DocumentChangesDocument = gql`
  ${PHDocumentFieldsFragment}
  subscription DocumentChanges(
    $search: SearchFilterInput!
    $view: ViewFilterInput
  ) {
    documentChanges(search: $search, view: $view) {
      type
      documents {
        ...PHDocumentFields
      }
      context {
        parentId
        childId
      }
    }
  }
`;

export const JobChangesDocument = gql`
  subscription JobChanges($jobId: String!) {
    jobChanges(jobId: $jobId) {
      jobId
      status
      result
      error
    }
  }
`;
