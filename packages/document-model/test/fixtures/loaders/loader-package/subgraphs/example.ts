import { ph } from "document-model";
import { BaseSubgraph, type SchemaBuilder } from "@powerhousedao/reactor-api";

const Widget = ph.object("Widget", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

export class ExampleSubgraph extends BaseSubgraph {
  static override readonly subgraphName = "example";

  static override getSchema(schema: SchemaBuilder<ExampleSubgraph>) {
    return [
      schema.query("widget", {
        args: { id: ph.OID({ required: true }) },
        returns: ph.ref(Widget),
        resolve: ({ args }) => ({ id: String(args.id), label: "One" }),
      }),
    ];
  }
}
