import {
  createAction,
  Property,
  reactorOf,
} from "@powerhousedao/pieces-framework";
import {
  allowedActionTypes,
  ConfigReader,
  parseActionInput,
  parseDispatchPayload,
} from "../parse.js";
import { coerceInput } from "../input-props.js";
import {
  ACTION_GROUP,
  actionInputProp,
  actionInputSchema,
  actionsProp,
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
  parseProp,
} from "../reactor.js";

const BLOCK = "document-dispatch";

export const documentDispatchAction = createAction({
  name: BLOCK,
  displayName: "Dispatch actions",
  description: "Sends actions to a document.",
  requireAuth: false,
  propertyGroups: [ACTION_GROUP("Sent to the document.")],
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
    actionType: actionTypeProp("Type", false),
    input: actionInputProp("Input"),
    actions: actionsProp(
      "Action list (JSON)",
      'Several actions at once, or a payload from an earlier step: [{ "type": …, "input": … }]',
    ),
    allowedActions: Property.ShortText({
      displayName: "Allowed action types",
      description: "Comma-separated whitelist; enforced when set",
      required: false,
      advanced: true,
    }),
    branch: Property.ShortText({
      displayName: "Branch",
      description: 'Defaults to "main"',
      required: false,
      advanced: true,
    }),
    parse: parseProp(),
  },
  run: async (ctx) => {
    const config = ctx.propsValue;
    const reader = ConfigReader.of(BLOCK, config.parse);
    const payload = parseDispatchPayload(config.actions, reader);
    const documentId =
      reader.documentId(config.documentId, "documentId") ?? payload.documentId;
    if (!documentId) {
      throw new Error(
        `${BLOCK}: "documentId" is required, in the config or the actions payload`,
      );
    }
    // The picked action goes first, its input typed by the model's schema.
    const actionType =
      typeof config.actionType === "string" ? config.actionType.trim() : "";
    if (actionType) {
      const schema = await actionInputSchema(reactorOf(ctx), {
        ...config,
        documentId,
      });
      const input = parseActionInput(config.input, reader);
      payload.actions.unshift({
        type: actionType,
        input: schema ? coerceInput(schema, input) : input,
        scope: undefined,
      });
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
      throw new Error(
        `${BLOCK}: choose an Action, or give a non-empty "Action list (JSON)"`,
      );
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
      ...reader.output(),
    };
  },
});
