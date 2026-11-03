import { getPHStore } from "../hooks/ph-store.js";
import { DriveCollectionId, type ISyncManager } from "@powerhousedao/reactor";
import type { PhAiToolContext } from "@powerhousedao/shared/document-model";
import { z } from "zod";
import { ambientRenownTokenProvider } from "../graphql-client/auth.js";
import { resolveSwitchboard } from "../utils/switchboard-directory.js";
import type { AiToolContext, AiToolDescriptor } from "./types.js";

/**
 * The switchboard serving a remote drive: the base URL the browser talks to
 * and its GraphQL supergraph endpoint.
 */
export interface DriveSwitchboard {
  /** Switchboard base URL (e.g. `http://localhost:4001`). */
  switchboardUrl: string;
  /** GraphQL supergraph endpoint (`<base>/graphql`). */
  graphqlUrl: string;
}

/**
 * Reads the tab-side sync manager from the browser global. Returns
 * `undefined` in non-browser environments or before the reactor client
 * module is initialized.
 */
export function getBrowserSyncManager(): ISyncManager | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  return getPHStore()?.reactorClientModule?.reactorModule?.syncModule
    ?.syncManager;
}

/** Suffix of the per-drive GraphQL channel endpoint the switchboard serves. */
export const GQL_CHANNEL_SUFFIX = "/graphql/r";

/**
 * Resolves the switchboard that serves a drive, if any.
 *
 * Every remote drive stores its switchboard's exact GraphQL channel
 * endpoint in its sync remote — `channelConfig = { type: "gql",
 * parameters: { url: "<origin>/graphql/r" } }` — and the switchboard base
 * is that URL minus the `/graphql/r` suffix. Deriving it per drive (rather
 * than from a global setting) is what keeps multi-switchboard deployments
 * correct. Drives that are not synced to a remote switchboard (local
 * drives, other channel types, unexpected shapes) return `undefined`.
 *
 * @deprecated Reads synced drives only, so it finds nothing for a remote
 * client's drives. Use the host's switchboard directory (`resolveSwitchboard`).
 */
export function resolveDriveSwitchboard(
  driveId: string | undefined,
  syncManager?: ISyncManager,
): DriveSwitchboard | undefined {
  const manager = syncManager ?? getBrowserSyncManager();
  if (!driveId || !manager) {
    return undefined;
  }
  const collectionId = DriveCollectionId.forDrive(driveId);
  const remote = manager
    .list()
    .find((r) => r.meta.collectionId.equals(collectionId));
  if (!remote) {
    return undefined;
  }
  const { channelConfig } = remote.meta;
  if (channelConfig.type !== "gql") {
    return undefined;
  }
  const url = channelConfig.parameters.url;
  if (typeof url !== "string" || !url.endsWith(GQL_CHANNEL_SUFFIX)) {
    return undefined;
  }
  const switchboardUrl = url.slice(0, -GQL_CHANNEL_SUFFIX.length);
  return { switchboardUrl, graphqlUrl: `${switchboardUrl}/graphql` };
}

/** A bounded introspected GraphQL type reference (see the query below). */
type IntrospectedTypeRef = {
  kind: string;
  name: string | null;
  ofType?: IntrospectedTypeRef | null;
};

type IntrospectedField = {
  name: string;
  description: string | null;
  args: Array<{ name: string; type: IntrospectedTypeRef }>;
  type: IntrospectedTypeRef;
};

type IntrospectedRootType = {
  fields: IntrospectedField[] | null;
} | null;

type IntrospectedSchema = {
  queryType?: IntrospectedRootType;
  mutationType?: IntrospectedRootType;
};

/**
 * Introspection over the switchboard supergraph's root query and mutation
 * fields. Types are requested with three levels of `ofType` nesting so
 * that common shapes like `[X!]!` (LIST(NON_NULL(LIST(X)))) render fully.
 */
export const SWITCHBOARD_INTROSPECTION_QUERY: string = /* GraphQL */ `
  query SwitchboardIntrospection {
    __schema {
      queryType {
        fields {
          name
          description
          args {
            name
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
      mutationType {
        fields {
          name
          description
          args {
            name
            type {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                  ofType {
                    kind
                    name
                  }
                }
              }
            }
          }
          type {
            kind
            name
            ofType {
              kind
              name
              ofType {
                kind
                name
                ofType {
                  kind
                  name
                }
              }
            }
          }
        }
      }
    }
  }
`;

/**
 * Renders an introspected type reference as a GraphQL type string.
 * Recursion is bounded by the `ofType` nesting of the query, so it always
 * terminates.
 */
function renderTypeRef(type: IntrospectedTypeRef | null | undefined): string {
  if (!type) {
    return "Unknown";
  }
  switch (type.kind) {
    case "NON_NULL":
      return `${renderTypeRef(type.ofType)}!`;
    case "LIST":
      return `[${renderTypeRef(type.ofType)}]`;
    default:
      return type.name ?? "Unknown";
  }
}

/** One root query or mutation field, reduced to a prompt-friendly line. */
export type SchemaFieldSummary = {
  name: string;
  description?: string;
  args: string;
  returns: string;
};

/** Cap on the number of fields reported per root type. */
const MAX_FIELDS_PER_ROOT = 200;

function summarizeFields(fields: IntrospectedField[] | null | undefined): {
  fields: SchemaFieldSummary[];
  truncated: boolean;
} {
  const list = fields ?? [];
  return {
    fields: list.slice(0, MAX_FIELDS_PER_ROOT).map((field) => ({
      name: field.name,
      ...(field.description ? { description: field.description } : {}),
      args: field.args
        .map((arg) => `${arg.name}: ${renderTypeRef(arg.type)}`)
        .join(", "),
      returns: renderTypeRef(field.type),
    })),
    truncated: list.length > MAX_FIELDS_PER_ROOT,
  };
}

/**
 * Reduces a GraphQL `__schema` introspection payload (the `data.__schema`
 * object) to a compact summary of its root query and mutation fields.
 * Accepts `unknown` because the payload arrives over the wire.
 */
export function summarizeIntrospectionSchema(schema: unknown): {
  queries: SchemaFieldSummary[];
  mutations: SchemaFieldSummary[];
  truncated: boolean;
} {
  const introspection = (schema ?? {}) as IntrospectedSchema;
  const queries = summarizeFields(introspection.queryType?.fields);
  const mutations = summarizeFields(introspection.mutationType?.fields);
  return {
    queries: queries.fields,
    mutations: mutations.fields,
    truncated: queries.truncated || mutations.truncated,
  };
}

export const SWITCHBOARD_SCHEMA_TOOL_NAME = "getSwitchboardSchema";

/** Test seams for {@link createSwitchboardSchemaTool}. */
export interface SwitchboardToolDeps {
  tokenProvider?: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Creates the read-only `getSwitchboardSchema` tool: it introspects the
 * GraphQL supergraph of a switchboard the host reaches and returns a summary
 * of its root queries and mutations. It reads the schema only and never
 * modifies data. The switchboard comes from the host's directory, which the
 * agent hands every call.
 */
export function createSwitchboardSchemaTool(
  deps?: SwitchboardToolDeps,
): AiToolDescriptor {
  const tokenProvider = deps?.tokenProvider ?? ambientRenownTokenProvider;
  const fetchImpl = deps?.fetchImpl ?? fetch;
  const timeoutMs = deps?.timeoutMs ?? 10_000;

  return {
    name: SWITCHBOARD_SCHEMA_TOOL_NAME,
    description:
      "Introspect the GraphQL endpoint of a switchboard and list the queries and mutations it exposes (reactor operations, document-model read models, package subgraphs). Read-only: it reads the schema only and never modifies data. Omit both inputs when the app reaches one switchboard.",
    inputSchema: {
      driveId: z
        .string()
        .describe("A drive whose switchboard to introspect.")
        .optional(),
      switchboard: z
        .string()
        .describe(
          "The switchboard to introspect: a name or URL from listSwitchboards.",
        )
        .optional(),
    },
    annotations: { readOnlyHint: true },
    callback: async (
      input: { driveId?: string; switchboard?: string } | undefined,
      context?: PhAiToolContext,
    ) => {
      const { switchboards, signal } = (context ?? {}) as AiToolContext;
      const entry = await resolveSwitchboard(switchboards, {
        switchboard: input?.switchboard,
        documentId: input?.driveId,
        signal,
      });
      const sb = { switchboardUrl: entry.base, graphqlUrl: entry.graphqlUrl };

      const token = await tokenProvider();
      let response: Response;
      try {
        response = await fetchImpl(sb.graphqlUrl, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(token ? { authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ query: SWITCHBOARD_INTROSPECTION_QUERY }),
          signal: signal
            ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
            : AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        throw new Error(
          `Switchboard at ${sb.graphqlUrl} is not reachable: ${
            error instanceof Error ? error.message : String(error)
          }`,
          { cause: error },
        );
      }

      if (response.status === 401 || response.status === 403) {
        throw new Error(
          `Switchboard at ${sb.graphqlUrl} refused the request (HTTP ${response.status}). Sign in to the switchboard (Renown) and try again.`,
        );
      }
      if (!response.ok) {
        throw new Error(
          `Switchboard introspection failed: HTTP ${response.status} ${response.statusText} from ${sb.graphqlUrl}`,
        );
      }

      const body = (await response.json()) as {
        errors?: Array<{ message?: string }>;
        data?: { __schema?: unknown } | null;
      } | null;
      const schemaErrors = body?.errors;
      if (schemaErrors && schemaErrors.length > 0) {
        throw new Error(
          schemaErrors.map((e) => e.message ?? "unknown error").join("; "),
        );
      }
      const schema = body?.data?.__schema as
        | IntrospectedSchema
        | null
        | undefined;
      if (!schema?.queryType) {
        throw new Error(
          `Switchboard at ${sb.graphqlUrl} did not return a GraphQL schema.`,
        );
      }

      const summary = summarizeIntrospectionSchema(schema);
      return {
        switchboard: entry.name,
        switchboardUrl: sb.switchboardUrl,
        graphqlUrl: sb.graphqlUrl,
        ...summary,
      };
    },
  };
}

export const LIST_SWITCHBOARDS_TOOL_NAME = "listSwitchboards";

/**
 * Creates the read-only `listSwitchboards` tool: the switchboards the host
 * reaches, by the names other tools take as `switchboard`.
 */
export function createListSwitchboardsTool(): AiToolDescriptor {
  return {
    name: LIST_SWITCHBOARDS_TOOL_NAME,
    description:
      'Lists the switchboards this app reaches: each one\'s name, URL, how it is reached, and whether it runs a workflow runtime (true, false or "unknown"). Pass a name or URL as `switchboard` to the tools that ask a switchboard; with one switchboard they need none.',
    inputSchema: {},
    annotations: { readOnlyHint: true },
    callback: (_input: unknown, context?: PhAiToolContext) => {
      const { switchboards } = (context ?? {}) as AiToolContext;
      if (!switchboards) {
        return Promise.reject(
          new Error(
            "This app provides no switchboard directory, so it lists no switchboards.",
          ),
        );
      }
      return Promise.resolve({
        switchboards: switchboards.list().map((entry) => ({
          name: entry.name,
          url: entry.base,
          graphqlUrl: entry.graphqlUrl,
          via: entry.via,
          workflows: entry.workflows,
        })),
      });
    },
  };
}
