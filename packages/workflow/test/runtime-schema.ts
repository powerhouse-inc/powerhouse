// The workflow-runtime subgraph schema, read from Switchboard's source: this
// package can't depend on Switchboard, which depends on it.
import { readFileSync } from "node:fs";
import {
  buildASTSchema,
  concatAST,
  graphql,
  parse,
  visit,
  type GraphQLSchema,
} from "graphql";

const SCHEMA_SOURCE = new URL(
  "../../../apps/switchboard/src/workflow/schema.ts",
  import.meta.url,
);
const BUILTIN_SCALARS = new Set(["String", "Int", "Float", "Boolean", "ID"]);

function loadRuntimeSchema(): GraphQLSchema {
  const source = readFileSync(SCHEMA_SOURCE, "utf8");
  const sdl = /gql`([\s\S]*?)`;/.exec(source)?.[1];
  if (!sdl) throw new Error(`No gql schema in ${SCHEMA_SOURCE.pathname}`);
  const document = parse(sdl);
  const defined = new Set<string>();
  const used = new Set<string>();
  for (const definition of document.definitions) {
    if ("name" in definition && definition.name) {
      defined.add(definition.name.value);
    }
  }
  visit(document, {
    NamedType(node) {
      used.add(node.name.value);
    },
  });
  // Scalars such as Unknown come from reactor-api's base schema.
  const scalars = [...used]
    .filter((name) => !defined.has(name) && !BUILTIN_SCALARS.has(name))
    .map((name) => `scalar ${name}`);
  return buildASTSchema(
    scalars.length > 0
      ? concatAST([document, parse(scalars.join("\n"))])
      : document,
  );
}

export const runtimeSchema = loadRuntimeSchema();

/** Parse, validation and variable errors: what the server refuses outright. */
export async function requestErrors(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<string[]> {
  const result = await graphql({
    schema: runtimeSchema,
    source: query,
    variableValues: variables,
    rootValue: {},
  });
  return (result.errors ?? [])
    .filter((error) => !error.path)
    .map((error) => error.message);
}

export interface SentRequest {
  url: string;
  query: string;
  variables: Record<string, unknown>;
  headers: Record<string, string>;
}

/** Field answers under `workflowRuntime`; a function gets the field's args. */
export type RuntimeRoot = Record<string, unknown>;

// A fetch that executes every request against the real schema.
export function schemaFetch(workflowRuntime: RuntimeRoot = {}) {
  const sent: SentRequest[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();
    const body = JSON.parse(init?.body as string) as {
      query: string;
      variables?: Record<string, unknown>;
    };
    sent.push({
      url,
      query: body.query,
      variables: body.variables ?? {},
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    const result = await graphql({
      schema: runtimeSchema,
      source: body.query,
      variableValues: body.variables,
      rootValue: { workflowRuntime },
    });
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return { sent, fetch: fetchFn as typeof fetch };
}
