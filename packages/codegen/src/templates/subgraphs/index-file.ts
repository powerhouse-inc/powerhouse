import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const subgraphIndexFileTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
  kebabCaseName: string;
  itemTypeName?: string;
}) => {
  const itemTypeName = v.itemTypeName ?? `${v.pascalCaseName}SubgraphItem`;
  return ts`
import { BaseSubgraph, type SchemaBuilder } from "${REACTOR_API_PACKAGE}";
import { ph } from "document-model";
import { ${itemTypeName} } from "./schema.js";

export class ${v.pascalCaseName}Subgraph extends BaseSubgraph {
  static override readonly subgraphName = "${v.kebabCaseName}";

  static override getSchema(schema: SchemaBuilder<${v.pascalCaseName}Subgraph>) {
    return [
      schema.query("${v.camelCaseName}Item", {
        args: { id: ph.OID({ required: true }) },
        returns: ph.ref(${itemTypeName}, { required: true }),
        resolve: ({ args }) => ({ id: args.id, label: "Example" }),
      }),
    ];
  }
}
`.raw;
};
