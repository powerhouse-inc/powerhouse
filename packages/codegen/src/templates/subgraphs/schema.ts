import { ts } from "@tmpl/core";

export const subgraphSchemaTemplate = (v: {
  pascalCaseName: string;
  itemTypeName?: string;
}) => {
  const itemTypeName = v.itemTypeName ?? `${v.pascalCaseName}SubgraphItem`;
  return ts`
import { ph } from "document-model";

export const ${itemTypeName} = ph.object("${itemTypeName}", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});
`.raw;
};
