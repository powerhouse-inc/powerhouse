import { createAction, reactorOf } from "@powerhousedao/pieces-framework";
import { ConfigReader } from "../parse.js";
import {
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
  parseProp,
} from "../reactor.js";

const BLOCK = "document-schema";

export const documentSchemaAction = createAction({
  name: BLOCK,
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
    parse: parseProp(),
  },
  run: async (ctx) => {
    const reactor = reactorOf(ctx);
    const { actionType } = ctx.propsValue;
    const reader = ConfigReader.of(BLOCK, ctx.propsValue.parse);
    let documentType =
      typeof ctx.propsValue.documentType === "string"
        ? ctx.propsValue.documentType
        : "";
    // A document id is accepted in place of a type, for expression-fed steps.
    const fromId = documentType
      ? undefined
      : reader.documentId(ctx.propsValue.documentId, "documentId");
    if (fromId) {
      documentType = (await reactor.get({ documentId: fromId })).documentType;
    }
    if (!documentType) {
      throw new Error(`${BLOCK}: "documentType" is required`);
    }
    const model = await reactor.model(documentType);
    return {
      documentType: model.documentType,
      name: model.name,
      stateSchema: model.stateSchema,
      actions: actionType
        ? model.actions.filter((action) => action.type === actionType)
        : model.actions,
      ...reader.output(),
    };
  },
});
