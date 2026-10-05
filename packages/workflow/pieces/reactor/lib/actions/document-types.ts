import { createAction, reactorOf } from "@powerhousedao/pieces-framework";

export const documentTypesAction = createAction({
  name: "document-types",
  displayName: "List document types",
  description: "Document models installed on this reactor.",
  requireAuth: false,
  props: {},
  run: async (ctx) => {
    const types = await reactorOf(ctx).models();
    return { count: types.length, types };
  },
});
