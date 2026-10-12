import { ph } from "document-model";
import { defineSubgraph } from "@powerhousedao/reactor-api";

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
