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
    const found = await reactorOf(ctx).find({
      ...(documentType ? { documentType } : {}),
      ...(parentId ? { parentId } : {}),
    });
    // The index filters by type only; names are matched here.
    const needle = typeof name === "string" ? name.trim().toLowerCase() : "";
    const documents = found
      .filter(
        (document) => !needle || document.name.toLowerCase().includes(needle),
      )
      .slice(0, capped);
    return { count: documents.length, documents };
  },
});
