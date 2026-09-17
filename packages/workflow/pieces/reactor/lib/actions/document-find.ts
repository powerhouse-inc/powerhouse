import {
  createAction,
  Property,
  reactorOf,
} from "@powerhousedao/pieces-framework";
import { documentTypeProp, driveProp } from "../reactor.js";

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
    matchPath: Property.ShortText({
      displayName: "State field",
      description:
        'Dotted path into the document\'s state, e.g. "orderId" or "settlement.status". With a value below, only documents holding it are returned.',
      required: false,
    }),
    matchValue: Property.ShortText({
      displayName: "State value",
      description:
        "Compared as text, e.g. {{trigger.payload.orderId}}. Documents missing the field never match.",
      required: false,
    }),
    includeState: Property.Checkbox({
      displayName: "Include state",
      description:
        "Returns each document's state as well as its id and name. Off by default: a page of documents carries a page of states.",
      required: false,
      defaultValue: false,
    }),
    limit: Property.Number({
      displayName: "Max results",
      description: `Defaults to ${DEFAULT_LIMIT}`,
      required: false,
    }),
  },
  run: async (ctx) => {
    const {
      documentType,
      parentId,
      name,
      limit,
      matchPath,
      matchValue,
      includeState,
    } = ctx.propsValue;
    const capped = Math.min(
      Math.max(typeof limit === "number" ? limit : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );
    // A state match names a field but not its value, or the other way round:
    // that is an unfinished step, and answering it as "no filter" would return
    // every document of the type to something that asked for one.
    const path = typeof matchPath === "string" ? matchPath.trim() : "";
    const wanted = typeof matchValue === "string" ? matchValue.trim() : "";
    if ((path === "") !== (wanted === "")) {
      throw new Error(
        'document-find: "State field" and "State value" are set together or not at all',
      );
    }
    // Neither the name nor the state filter is an index query, so either one
    // has to see more rows than the step will keep; without one, ask for
    // exactly the page wanted rather than a default page per model.
    const needle = typeof name === "string" ? name.trim().toLowerCase() : "";
    const filtered = needle !== "" || path !== "";
    const found = await reactorOf(ctx).find({
      ...(documentType ? { documentType } : {}),
      ...(parentId ? { parentId } : {}),
      ...(filtered ? {} : { limit: capped }),
      ...(path ? { match: { path, value: wanted } } : {}),
      ...(includeState === true ? { withState: true } : {}),
    });
    const documents = found
      .filter(
        (document) => !needle || document.name.toLowerCase().includes(needle),
      )
      .slice(0, capped);
    return { count: documents.length, documents };
  },
});
