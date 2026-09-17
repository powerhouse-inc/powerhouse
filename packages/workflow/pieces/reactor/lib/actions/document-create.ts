import {
  createAction,
  Property,
  reactorOf,
} from "@powerhousedao/pieces-framework";
import { parseActions, parseCreatePayload } from "../parse.js";
import {
  actionsProp,
  actionTypeProp,
  documentTypeProp,
  driveProp,
} from "../reactor.js";

const BLOCK = "document-create";

export const documentCreateAction = createAction({
  name: BLOCK,
  displayName: "Create document",
  description: "Creates a Powerhouse document.",
  requireAuth: false,
  props: {
    documentType: documentTypeProp(),
    name: Property.ShortText({ displayName: "Document name", required: false }),
    parentId: driveProp("Parent drive/folder"),
    actions: actionsProp("Initial actions"),
    actionType: actionTypeProp(
      "Action type",
      false,
      "Suggestions for the action list above",
    ),
    payload: Property.ShortText({
      displayName: "Payload",
      description:
        "JSON {documentType, name, actions?}, e.g. {{steps.draft.output}}",
      required: false,
    }),
  },
  run: async (ctx) => {
    const reactor = reactorOf(ctx);
    const config = ctx.propsValue;
    // A payload (typically model output) can name the type and the document.
    const payload = parseCreatePayload(config.payload, BLOCK);
    const documentType =
      (typeof config.documentType === "string" && config.documentType) ||
      payload.documentType;
    if (!documentType) {
      throw new Error(
        `${BLOCK}: "documentType" is required, in the config or the payload`,
      );
    }
    const name =
      (typeof config.name === "string" && config.name) || payload.name;
    const created = await reactor.create({
      documentType,
      ...(name ? { name } : {}),
      ...(config.parentId ? { parentId: config.parentId } : {}),
    });

    // The name travelled with the create; only the author's own actions are
    // left to dispatch.
    const followUps = parseActions(config.actions ?? payload.actions, BLOCK);
    const document = followUps.length
      ? await reactor.execute({
          documentId: created.documentId,
          actions: followUps,
        })
      : created;

    return {
      documentId: document.documentId,
      documentType: document.documentType,
      name: document.name,
      state: document.state,
    };
  },
});
