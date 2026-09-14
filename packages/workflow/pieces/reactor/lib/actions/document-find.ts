import { createAction, Property } from "@activepieces/pieces-framework";
import { documentTypeProp, driveProp, reactorOf } from "../reactor.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const documentFindAction = createAction({
  name: "document-find",
  displayName: "Find documents",
  description: "Lists documents by type and name.",
  requireAuth: false,
  props: {
    documentType: documentTypeProp("Document type", false, "Omit for any type"),
    parentId: driveProp("In drive/folder", "Omit for the whole reactor"),
    name: Property.ShortText({
      displayName: "Name contains",
      description: "Case-insensitive match",
      required: false,
    }),
    limit: Property.Number({
      displayName: "Max results",
      description: `Defaults to ${DEFAULT_LIMIT}`,
      required: false,
    }),
  },
  run: async (ctx) => {
    const { documentType, parentId, name, limit } = ctx.propsValue;
    const capped = Math.min(
      Math.max(typeof limit === "number" ? limit : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    // The index does not match names, so a name filter has to see more rows
    // than the step will keep; without one, ask for exactly the page wanted
    // rather than a default page per model.
    const needle = typeof name === "string" ? name.trim().toLowerCase() : "";
    const found = await reactorOf(ctx).find({
      ...(documentType ? { documentType } : {}),
      ...(parentId ? { parentId } : {}),
      ...(needle ? {} : { limit: capped }),
    });
    const documents = found
      .filter(
        (document) => !needle || document.name.toLowerCase().includes(needle),
      )
      .slice(0, capped);
    return { count: documents.length, documents };
  },
});
