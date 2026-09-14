import { createAction, Property } from "@activepieces/pieces-framework";
import {
  allowedActionTypes,
  parseDispatchPayload,
  resolveDocumentId,
} from "../parse.js";
import {
  actionsProp,
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
  reactorOf,
} from "../reactor.js";

const BLOCK = "document-dispatch";

export const documentDispatchAction = createAction({
  name: BLOCK,
  displayName: "Dispatch actions",
  description: "Sends actions to a document.",
  requireAuth: false,
  props: {
    documentId: documentIdProp(
      "Document id",
      true,
      "e.g. {{steps.create.output.documentId}}",
    ),
    documentType: documentTypeProp(
      "Document type",
      false,
      "Design-time hint when the document id is an expression",
    ),
    actions: actionsProp("Actions", true),
    actionType: actionTypeProp("Action type", false, "Suggestions for the action list above"),
    allowedActions: Property.ShortText({
      displayName: "Allowed action types",
      description: "Comma-separated whitelist; enforced when set",
      required: false,
    }),
    branch: Property.ShortText({
      displayName: "Branch",
      description: 'Defaults to "main"',
      required: false,
    }),
  },
  run: async (ctx) => {
    const config = ctx.propsValue;
    const payload = parseDispatchPayload(config.actions, BLOCK);
    const documentId =
      resolveDocumentId(config.documentId) ??
      resolveDocumentId(payload.documentId);
    if (!documentId) {
      throw new Error(
        `${BLOCK}: "documentId" is required, in the config or the actions payload`,
      );
    }
    // Enforced, not merely suggested: the payload may come from an LLM.
    const allowed = allowedActionTypes(config.allowedActions);
    const rejected = allowed.length
      ? payload.actions.filter((entry) => !allowed.includes(entry.type))
      : [];
    if (rejected.length > 0) {
      throw new Error(
        `${BLOCK}: action(s) not allowed here: ${[
          ...new Set(rejected.map((entry) => entry.type)),
        ].join(", ")}`,
      );
    }
    if (payload.actions.length === 0) {
      throw new Error(`${BLOCK}: "actions" must be a non-empty list`);
    }
    const document = await reactorOf(ctx).execute({
      documentId,
      ...(config.branch ? { branch: config.branch } : {}),
      actions: payload.actions,
    });
    return {
      documentId: document.documentId,
      documentType: document.documentType,
      name: document.name,
      state: document.state,
    };
  },
});
