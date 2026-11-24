import type {
  DocumentModelModule,
  ISigner,
} from "@powerhousedao/shared/document-model";
import type { ReactorProtocol } from "@powerhousedao/host-core";
import type {
  BearerTokenProvider,
  GraphQLReactorClientOptions,
} from "@powerhousedao/reactor-browser/graphql-client";

/**
 * P5.5 — the agent host's reactor is a REMOTE attach: a running switchboard,
 * reached over GraphQL, with nothing of it glued to the CLI's lifetime. N
 * agents attach to ONE reactor as clients; the switchboard
 * outlives agent sessions. The agent DEPENDS on the switchboard — an
 * unreachable remote fails the attach loudly with the start hint, it never
 * auto-starts one.
 */

export interface AttachRemoteReactorOptions {
  /**
   * Where the switchboard lives: its GraphQL endpoint
   * (`http://localhost:4001/graphql`), a drive url (`…/d/<drive>`), or a bare
   * origin — the endpoint is derived.
   */
  url: string;
  /** Document models the client signs/reduces with. */
  documentModels: readonly DocumentModelModule<any>[];
  /**
   * What this agent expects of the fleet it joins (the host file's
   * reactor.protocol). Reachability and inspection facts are checked at
   * attach; flag-level comparison engages once the inspection subgraph
   * exposes the enforcement flags (upstream note in the phase-5 WBS) — until
   * then the expectation is carried for the error message and future use.
   */
  expectedProtocol?: ReactorProtocol;
  /** Bearer for authenticated switchboards; omitted = unauthenticated. */
  token?: string;
  /**
   * Resolves the bearer per request, for a token that expires (a Renown
   * token). Takes precedence over `token`. Returning undefined sends the
   * request unauthenticated.
   */
  tokenProvider?: BearerTokenProvider;
  /**
   * Signs the actions the client pushes. A function is called per push (see
   * `createReactorWrites`, whose `signer` refuses while the identity has no
   * user), and may resolve asynchronously (a forwarded command's caller).
   * Omitted, the client falls back to the ambient Renown signer, which does
   * not exist in Node: actions then go out unsigned.
   */
  signer?: ISigner | (() => ISigner | undefined | Promise<ISigner | undefined>);
  /** Reachability probe budget. */
  timeoutMs?: number;
}

export interface RemoteReactorAttachment {
  /** The derived GraphQL endpoint actually dialed. */
  endpoint: string;
  /** IReactorClient-compatible GraphQL client (reactor-browser). */
  client: unknown;
  /** Remote facts from the inspection subgraph, when it answers. */
  remoteInfo?: Record<string, unknown>;
}

/** Derive the GraphQL endpoint from the accepted url spellings. */
export function deriveGraphqlEndpoint(url: string): string {
  const parsed = new URL(url);
  if (parsed.pathname.includes("/d/")) {
    return `${parsed.origin}/graphql`;
  }
  if (parsed.pathname.replace(/\/$/, "").endsWith("/graphql")) {
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  }
  const base = parsed.pathname.replace(/\/$/, "");
  return `${parsed.origin}${base}/graphql`;
}

async function probeEndpoint(
  endpoint: string,
  timeoutMs: number,
): Promise<void> {
  try {
    // A GraphQL endpoint answers POST; any HTTP response (even 400) proves
    // the server is listening. Only transport failure means unreachable.
    await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (cause) {
    throw new Error(
      `Cannot attach to the reactor at ${endpoint}: the switchboard is not ` +
        `answering. The agent depends on a RUNNING switchboard and never ` +
        `starts one — start it first (e.g. \`ph run switchboard\`, ` +
        `\`ph dev\`, or the compound that members both) and retry.`,
      { cause },
    );
  }
}

/** Read the inspection subgraph's info when it answers (dev switchboards
 * under the OPEN policy serve it); absence is not an attach failure. */
async function readRemoteInfo(
  endpoint: string,
  tokenProvider: BearerTokenProvider | undefined,
  timeoutMs: number,
): Promise<Record<string, unknown> | undefined> {
  try {
    const token = await tokenProvider?.();
    const res = await fetch(`${endpoint}/inspection`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        query: "query ReactorInspectionInfo { inspection { info } }",
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return undefined;
    const body = (await res.json()) as {
      data?: { inspection?: { info?: Record<string, unknown> } };
    };
    return body.data?.inspection?.info;
  } catch {
    return undefined;
  }
}

export async function attachRemoteReactor(
  options: AttachRemoteReactorOptions,
): Promise<RemoteReactorAttachment> {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const endpoint = deriveGraphqlEndpoint(options.url);

  const token = options.token;
  const tokenProvider =
    options.tokenProvider ??
    (token ? () => Promise.resolve<string | undefined>(token) : undefined);

  await probeEndpoint(endpoint, timeoutMs);
  const remoteInfo = await readRemoteInfo(endpoint, tokenProvider, timeoutMs);

  const { GraphQLReactorClient } =
    await import("@powerhousedao/reactor-browser/graphql-client");
  const clientOptions: GraphQLReactorClientOptions = {
    url: endpoint,
    documentModels: options.documentModels,
    ...(tokenProvider ? { tokenProvider } : {}),
    ...(options.signer ? { signer: options.signer } : {}),
  };
  const client = new GraphQLReactorClient(clientOptions);

  return { endpoint, client, remoteInfo };
}
