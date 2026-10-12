import { ph } from "document-model";
import { defineSubgraph } from "@powerhousedao/reactor-api";

/**
 * A code-first subgraph. Every loader accepts it under any export key in
 * `subgraphs/index.ts`, as a namespace, a direct or default export, or a value
 * of a default-exported object.
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
