import { createAction, reactorOf } from "@powerhousedao/pieces-framework";
import { resolveDocumentId } from "../parse.js";
import {
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
} from "../reactor.js";

export const documentSchemaAction = createAction({
  name: "document-schema",
  displayName: "Get document schema",
  description: "Action and state schemas of a document type.",
  requireAuth: false,
  props: {
    documentType: documentTypeProp(
      "Document type",
      false,
      "Required unless a document id is given",
    ),
    documentId: documentIdProp(
      "Document id",
      false,
      "Resolves the type from this document instead",
    ),
    actionType: actionTypeProp(
      "Only this action",
      false,
      "Omit to list every action",
    ),
  },
  run: async (ctx) => {
    const reactor = reactorOf(ctx);
    const { actionType } = ctx.propsValue;
    let documentType =
      typeof ctx.propsValue.documentType === "string"
        ? ctx.propsValue.documentType
        : "";
    // A document id is accepted in place of a type, for expression-fed steps.
    const fromId = resolveDocumentId(ctx.propsValue.documentId);
    if (!documentType && fromId) {
      documentType = (await reactor.get({ documentId: fromId })).documentType;
    }
    if (!documentType) {
      throw new Error('document-schema: "documentType" is required');
    }
    const model = await reactor.model(documentType);
    return {
      documentType: model.documentType,
      name: model.name,
      stateSchema: model.stateSchema,
      actions: actionType
        ? model.actions.filter((action) => action.type === actionType)
        : model.actions,
    };
  },
});
