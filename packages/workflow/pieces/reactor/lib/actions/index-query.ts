import { createAction, Property } from "@powerhousedao/pieces-framework";

const BLOCK = "index-query";

/**
 * A read of a read-model index: a custom subgraph such as a key index,
 * queried in the host process as this run's user. The index's own access
 * declarations decide what the user sees, exactly as over HTTP, and no
 * credential or URL reaches the workflow.
 */
export const indexQueryAction = createAction({
  name: BLOCK,
  displayName: "Query index",
  description:
    "Runs a GraphQL query against one of this reactor's index subgraphs (a key index, a mail index, …) as the workflow's user. Outputs the query's data; a refused or unknown index is an error.",
  requireAuth: false,
  requireReactor: "read",
  props: {
    subgraph: Property.ShortText({
      displayName: "Index",
      description:
        'The subgraph\'s name as the switchboard registers it, e.g. "key-index".',
      required: true,
    }),
    query: Property.LongText({
      displayName: "Query",
      description: "A GraphQL query document. Mutations are refused.",
      required: true,
    }),
    variables: Property.Json({
      displayName: "Variables",
      description: "The query's variables, as JSON.",
      required: false,
    }),
  },
  run: async (ctx) => {
    const config = ctx.propsValue;
    const subgraph = String(config.subgraph).trim();
    const query = String(config.query).trim();
    if (!subgraph) throw new Error(`${BLOCK}: "Index" is required.`);
    if (!query) throw new Error(`${BLOCK}: "Query" is required.`);
    const result = await ctx.reactor.query({
      subgraph,
      query,
      variables: variablesOf(config.variables),
    });
    if (result.errors?.length) {
      throw new Error(
        `The index "${subgraph}" refused the query: ${result.errors.map((e) => e.message).join("; ")}`,
      );
    }
    return result.data ?? {};
  },
});

/** The variables prop as an object: JSON text from a template, or the object itself. */
function variablesOf(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed: unknown = typeof value === "string" ? JSON.parse(value) : value;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${BLOCK}: "Variables" must be a JSON object.`);
  }
  return parsed as Record<string, unknown>;
}
