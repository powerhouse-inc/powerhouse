import { createAction, reactorOf } from "@powerhousedao/pieces-framework";
import { ConfigReader } from "../parse.js";
import { documentIdProp, documentTypeProp, parseProp } from "../reactor.js";

const BLOCK = "document-get";

export const documentGetAction = createAction({
  name: BLOCK,
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
    parse: parseProp(),
  },
  run: async (ctx) => {
    const reader = ConfigReader.of(BLOCK, ctx.propsValue.parse);
    const documentId = reader.documentId(
      ctx.propsValue.documentId,
      "documentId",
    );
    if (!documentId) {
      throw new Error(`${BLOCK}: "documentId" is required`);
    }
    return {
      ...(await reactorOf(ctx).get({ documentId })),
      ...reader.output(),
    };
  },
});
