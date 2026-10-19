import { createAction } from "@powerhousedao/pieces-framework";
import { describeModel } from "../documents.js";
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
  requireReactor: "read",
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
    const reactor = ctx.reactor;
    const { actionType } = ctx.propsValue;
    const reader = ConfigReader.of(BLOCK, ctx.propsValue.parse);
    const documentType =
      typeof ctx.propsValue.documentType === "string"
        ? ctx.propsValue.documentType.trim()
        : "";
    // A document id is accepted in place of a type, for expression-fed steps.
    const fromId = documentType
      ? undefined
      : reader.documentId(ctx.propsValue.documentId, "documentId");
    if (!documentType && !fromId) {
      throw new Error(`${BLOCK}: "documentType" is required`);
    }
    const module = fromId
      ? await reactor.getDocumentModelModuleForDocument(
          await reactor.get(fromId),
        )
      : await reactor.getDocumentModelModule(documentType);
    const model = describeModel(module);
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
