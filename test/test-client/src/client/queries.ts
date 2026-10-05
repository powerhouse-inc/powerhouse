export const FIND_DRIVES_QUERY = `
  query FindDrives($type: String!) {
    findDocuments(search: { type: $type }) {
      items {
        id
        name
        documentType
      }
    }
  }
`;

export const FIND_DOCUMENT_MODELS_QUERY = `
  query FindDocumentModels {
    findDocuments(search: { type: "powerhouse/document-model", parentId: "powerhouse" }) {
      items {
        id
        name
        documentType
      }
    }
  }
`;

export const CREATE_EMPTY_DOCUMENT_MUTATION = `
  mutation CreateEmptyDocument($documentType: String!, $parentIdOrSlug: String) {
    createEmptyDocument(documentType: $documentType, parentIdOrSlug: $parentIdOrSlug) {
      id
      name
      documentType
    }
  }
`;

export const MUTATE_DOCUMENT_MUTATION = `
  mutation MutateDocument($documentIdOrSlug: String!, $actions: [ActionInput!]!) {
    mutateDocument: execute(
      documentIdOrSlug: $documentIdOrSlug
      actions: $actions
    ) {
      id
      name
      revisionsList {
        scope
        revision
      }
    }
  }
`;
