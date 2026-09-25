import {
  createAction,
  Property,
  reactorOf,
} from "@powerhousedao/pieces-framework";
import { coerceInput } from "../input-props.js";
import { parseActions, parseCreatePayload } from "../parse.js";
import {
  ACTION_GROUP,
  actionInputProp,
  actionInputSchema,
  actionsProp,
  actionTypeProp,
  documentTypeProp,
  driveProp,
  folderProp,
} from "../reactor.js";

const BLOCK = "document-create";

export const documentCreateAction = createAction({
  name: BLOCK,
  displayName: "Create document",
  description: "Creates a Powerhouse document.",
  requireAuth: false,
  propertyGroups: [ACTION_GROUP("Dispatched right after the create")],
  props: {
    documentType: documentTypeProp(),
    name: Property.ShortText({ displayName: "Document name", required: false }),
    parentId: driveProp("Parent drive"),
    folderId: folderProp("Folder", "parentId", "Omit for the drive's root"),
    actionType: actionTypeProp("Type", false),
    input: actionInputProp("Input"),
    actions: actionsProp(
      "Action list (JSON)",
      'Several actions after the create, or a payload from an earlier step: [{ "type": …, "input": … }]',
    ),
    payload: Property.ShortText({
      displayName: "Payload",
      description:
        "JSON {documentType, name, actions?}, e.g. {{steps.draft.output}}",
      required: false,
      advanced: true,
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
      // The host files into a folder by its id alone, finding its drive.
      ...(config.folderId || config.parentId
        ? { parentId: config.folderId || config.parentId }
        : {}),
    });

    // The name travelled with the create; only the author's own actions are
    // left to dispatch.
    const followUps = parseActions(config.actions ?? payload.actions, BLOCK);
    const actionType =
      typeof config.actionType === "string" ? config.actionType.trim() : "";
    if (actionType) {
      const schema = await actionInputSchema(reactor, {
        documentType,
        actionType,
      });
      followUps.unshift({
        type: actionType,
        input: schema
          ? coerceInput(schema, config.input)
          : (config.input ?? {}),
        scope: undefined,
      });
    }
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
