/**
 * Re-export generated GraphQL operations and typed document nodes
 *
 * All GraphQL operations are now defined in operations.graphql
 * and generated types are available from the generated files.
 */

// Export all generated types from graphql.ts
export * from "./generated/graphql.js";

// Export only the document constants from typed-document-nodes.ts (not the duplicate types)
export {
  AddChildrenDocument,
  CreateDocumentDocument,
  CreateEmptyDocumentDocument,
  DeleteDocumentDocument,
  DeleteDocumentsDocument,
  DocumentChangesDocument,
  FindDocumentsDocument,
  GetDocumentChildrenDocument,
  GetDocumentDocument,
  GetDocumentModelsDocument,
  GetDocumentParentsDocument,
  GetJobStatusDocument,
  JobChangesDocument,
  MoveChildrenDocument,
  MutateDocumentAsyncDocument,
  MutateDocumentDocument,
  PhDocumentFieldsFragmentDoc,
  RemoveChildrenDocument,
  RenameDocumentDocument,
} from "./generated/typed-document-nodes.js";

// Export only SDK creation function (not the duplicate types)
export { getSdk } from "./generated/sdk.js";
