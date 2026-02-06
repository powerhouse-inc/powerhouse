export const FIND_DRIVES_QUERY = `
  query FindDrives {
    findDocuments(search: { type: "powerhouse/document-drive" }) {
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
      totalCount
    }
  }
`;

export const CREATE_EMPTY_DOCUMENT_MUTATION = `
  mutation CreateEmptyDocument($documentType: String!, $parentIdentifier: String) {
    createEmptyDocument(documentType: $documentType, parentIdentifier: $parentIdentifier) {
      id
      name
      documentType
    }
  }
`;

export const MUTATE_DOCUMENT_MUTATION = `
  mutation MutateDocument($documentIdentifier: String!, $actions: [JSONObject!]!) {
    mutateDocument(documentIdentifier: $documentIdentifier, actions: $actions) {
      id
      name
      revisionsList {
        scope
        revision
      }
    }
  }
`;
