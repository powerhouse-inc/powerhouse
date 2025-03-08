---
to: "<%= rootDir %>/<%= h.changeCase.param(documentType) %>/gen/document-model.ts"
force: true
---
import type { DocumentModelState } from "document-model";

export const documentModel: DocumentModelState = <%- documentModel %>;