---
to: "<%= rootDir %>/<%= paramCaseDocumentType %>/gen/document-model.ts"
force: true
---
import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = <%- documentModel %>;