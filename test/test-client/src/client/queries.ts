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
