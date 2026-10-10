import { ph } from "document-model";
import { defineSubgraph } from "@powerhousedao/reactor-api";

/**
 * A code-first subgraph, exported under the convention every loader needs.
 *
 * The outer namespace name in `subgraphs/index.ts` has to equal this constant's
 * name: the Vite loader indexes the inner namespace with the outer export
 * name, while the import and HTTP loaders flatten it. Getting it wrong breaks
 * exactly one of the three, which is why a scaffold owns it.
 */

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

export const ExampleSubgraph = defineSubgraph({
  name: "example",
  schemaKind: "typed",
  entries: (build) => [
    build.query("widget", {
      args: { id: ph.OID({ required: true }) },
      returns: ph.ref(Widget),
      resolve: ({ args }) => ({ id: String(args.id), label: "One" }),
    }),
  ],
});
