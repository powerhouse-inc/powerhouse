import { createAction, Property } from "@powerhousedao/pieces-framework";
import { documentReference } from "@powerhousedao/pieces-framework/workflow";
import type { Action } from "@powerhousedao/shared/document-model";
import { DEFAULT_BRANCH, plainAction, typedAction } from "../documents.js";
import { coerceInput } from "../input-props.js";
import {
  allowedActionTypes,
  ConfigReader,
  parseActionInput,
  parseDispatchPayload,
} from "../parse.js";
import {
  ACTION_GROUP,
  actionInputProp,
  actionsProp,
  actionTypeProp,
  documentIdProp,
  documentTypeProp,
  moduleInputSchema,
  parseProp,
} from "../reactor.js";

const BLOCK = "document-dispatch";

export const documentDispatchAction = createAction({
  name: BLOCK,
  displayName: "Dispatch actions",
  description:
    "Sends actions to a document. Outputs a reference to it: id, type, branch and revision.",
  requireAuth: false,
  requireReactor: "write",
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
      'Several actions at once, or a payload from an earlier step: [{ "type": …, "input": …, "scope"?: "global" }]',
    ),
    allowedActions: Property.ShortText({
      displayName: "Allowed action types",
      description: "Comma-separated whitelist; enforced when set",
      required: false,
      advanced: true,
    }),
    branch: Property.ShortText({
      displayName: "Branch",
      required: false,
      defaultValue: DEFAULT_BRANCH,
      advanced: true,
    }),
    parse: parseProp(),
  },
  run: async (ctx) => {
    const reactor = ctx.reactor;
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
    const actions: Action[] = payload.actions.map((entry) =>
      plainAction(entry.type, entry.input, entry.scope),
    );
    // The picked action goes first, built by the document's own model.
    const actionType =
      typeof config.actionType === "string" ? config.actionType.trim() : "";
    if (actionType) {
      const module = await reactor.getDocumentModelModuleForDocument(
        await reactor.get(documentId),
      );
      const schema = moduleInputSchema(module, actionType);
      const input = parseActionInput(config.input, reader);
      actions.unshift(
        typedAction(
          module,
          actionType,
          schema ? coerceInput(schema, input) : input,
        ),
      );
    }
    // Enforced, not merely suggested: the payload may come from an LLM.
    const allowed = allowedActionTypes(config.allowedActions);
    const rejected = allowed.length
      ? actions.filter((entry) => !allowed.includes(entry.type))
      : [];
    if (rejected.length > 0) {
      throw new Error(
        `${BLOCK}: action(s) not allowed here: ${[
          ...new Set(rejected.map((entry) => entry.type)),
        ].join(", ")}`,
      );
    }
    if (actions.length === 0) {
      throw new Error(
        `${BLOCK}: choose an Action, or give a non-empty "Action list (JSON)"`,
      );
    }
    const branch =
      (typeof config.branch === "string" && config.branch.trim()) ||
      DEFAULT_BRANCH;
    const document = await reactor.execute(documentId, branch, actions);
    return { ...documentReference(document.header), ...reader.output() };
  },
});
