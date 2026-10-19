import { createAction } from "@powerhousedao/pieces-framework";
import { documentTypes } from "../reactor.js";

export const documentTypesAction = createAction({
  name: "document-types",
  displayName: "List document types",
  description: "Document models installed on this reactor.",
  requireAuth: false,
  requireReactor: "read",
  props: {},
  run: async (ctx) => {
    const types = await documentTypes(ctx.reactor);
    return { count: types.length, types };
  },
});
