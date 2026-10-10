import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const codeFirstSubgraphTemplate = (v: {
  name: string;
  exportName: string;
  pascalCaseName: string;
  camelCaseName: string;
  kebabCaseName: string;
}) =>
  ts`
/**
 * The ${v.name} subgraph. \`ph model check\` compiles it and validates the
 * schema the host serves, including the platform types and scalars the host
 * adds.
 */
import { defineSubgraph } from "${REACTOR_API_PACKAGE}";
import { ph } from "document-model";

const ${v.pascalCaseName}Item = ph.object("${v.pascalCaseName}Item", {
  fields: {
    id: ph.OID({ required: true }),
    label: ph.String({ required: true }),
  },
});

export const ${v.exportName} = defineSubgraph({
  name: "${v.kebabCaseName}",
  schemaKind: "typed",
  entries: ({ query, mutation }) => [
    query("${v.camelCaseName}Item", {
      description: "One ${v.name} item.",
      args: { id: ph.OID({ required: true }) },
      returns: ph.ref(${v.pascalCaseName}Item),
      // A resolver also receives \`subgraph\`, the instance the host built
      // with its dependencies, and \`request\`, the GraphQL context.
      resolve: ({ args }) => ({ id: String(args.id), label: "" }),
    }),

    mutation("set${v.pascalCaseName}Label", {
      args: {
        id: ph.OID({ required: true }),
        label: ph.String({ required: true }),
      },
      returns: ph.ref(${v.pascalCaseName}Item, { required: true }),
      resolve: ({ args }) => ({ id: String(args.id), label: String(args.label) }),
    }),
  ],
});
`.raw;
