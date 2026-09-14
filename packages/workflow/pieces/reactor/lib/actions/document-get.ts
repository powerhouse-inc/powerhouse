import { createAction } from "@activepieces/pieces-framework";
import { resolveDocumentId } from "../parse.js";
import { documentIdProp, documentTypeProp, reactorOf } from "../reactor.js";

export const documentGetAction = createAction({
  name: "document-get",
  displayName: "Get document",
  description: "Reads a document's current state.",
  requireAuth: false,
  props: {
    documentId: documentIdProp(
      "Document id",
      true,
      "e.g. {{steps.find.output.documents.0.documentId}}",
    ),
    documentType: documentTypeProp(
      "Document type",
      false,
      "Design-time hint when the document id is an expression",
    ),
  },
  run: async (ctx) => {
    const documentId = resolveDocumentId(ctx.propsValue.documentId);
    if (!documentId) {
      throw new Error('document-get: "documentId" is required');
    }
    return reactorOf(ctx).get({ documentId });
  },
});
