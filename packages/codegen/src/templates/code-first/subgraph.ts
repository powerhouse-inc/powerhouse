import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export type CodeFirstSubgraphTemplateArgs = {
  /** The kebab-case `subgraphName`, which is also the directory name. */
  readonly kebabName: string;
  readonly pascalName: string;
  readonly camelName: string;
};

export const codeFirstSubgraphTemplate = (v: CodeFirstSubgraphTemplateArgs) =>
  ts`
/**
 * The ${v.kebabName} subgraph. Codegen writes this file once and never
 * regenerates it.
 */
import {
  Subgraph,
  type SchemaBuilder,
  type SubgraphSchemaEntry,
} from "${REACTOR_API_PACKAGE}";
import { ph } from "document-model";
import { ${v.pascalName}Example } from "./schema.js";

export class ${v.pascalName}Subgraph extends Subgraph {
  static override readonly subgraphName = "${v.kebabName}";

  static override getSchema(
    schema: SchemaBuilder<${v.pascalName}Subgraph>,
  ): readonly SubgraphSchemaEntry<${v.pascalName}Subgraph>[] {
    return [
      schema.query("${v.camelName}Example", {
        args: { driveId: ph.String({ required: true }) },
        type: ph.ref(${v.pascalName}Example, { required: true }),
        resolve: ({ args }) => ({ driveId: args.driveId, message: "example" }),
      }),
    ];
  }
}
`.raw;

export const codeFirstSubgraphSchemaTemplate = (
  v: CodeFirstSubgraphTemplateArgs,
) =>
  ts`
/**
 * The types of the ${v.kebabName} subgraph, as \`ph\` descriptors. Codegen
 * writes this file once and never regenerates it.
 */
import { ph } from "document-model";

export const ${v.pascalName}Example = ph.object("${v.pascalName}Example", {
  fields: {
    driveId: ph.String({ required: true }),
    message: ph.String({ required: true }),
  },
});
`.raw;
