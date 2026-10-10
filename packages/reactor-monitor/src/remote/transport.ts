/**
 * Headers to send with every inspection request, resolved per request.
 *
 * A provider rather than a fixed record so a bearer can be refreshed without
 * re-provisioning the reactor: the monitor has no identity channel yet (the
 * worker path runs unauthenticated), and this is the seam an authenticated
 * monitor will thread a Renown/JWT token through. Returning `{}` is the
 * unauthenticated case, which is what a dev Switchboard serves.
 */
export type RemoteInspectionHeaders = () =>
  | Record<string, string>
  | Promise<Record<string, string>>;

/** How to reach a remote reactor's inspection subgraph. */
export type RemoteInspectionTransportOptions = {
  /**
   * The inspection subgraph's endpoint, e.g.
   * `https://switchboard.example/graphql/inspection`. The subgraph is also
   * stitched into the supergraph at `/graphql`, which works too; addressing
   * the subgraph directly keeps the request off the federation gateway.
   */
  url: string;
  /** Bearer or other headers; see {@link RemoteInspectionHeaders}. */
  headers?: RemoteInspectionHeaders;
  /** Defaults to the global `fetch`. Injected by tests and by a host with its own agent. */
  fetch?: typeof fetch;
};

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

/** The `extensions.code` reactor-api's inspection refusals carry. */
export const FORBIDDEN_CODE = "FORBIDDEN";

/**
 * A failed inspection request, carrying the GraphQL `extensions.code` when the
 * server sent one.
 *
 * The code is load-bearing, not decoration: a `FORBIDDEN` from the far side is
 * how a caller learns its cached picture of that host's admin tiers is STALE
 * (the host was restarted without the flag), as opposed to a transport fault or
 * the reactor refusing an op on its own merits. `RemoteInspectorClient` re-reads
 * `info` on exactly this code; without it a client would have to pattern-match
 * message text to tell the two apart.
 */
export class InspectionRequestError extends Error {
  /** The server's `extensions.code`, or `""` when it sent none. */
  readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InspectionRequestError";
    this.code = code;
  }
}

/**
 * One GraphQL endpoint, spoken to over `fetch`.
 *
 * Deliberately not a GraphQL client library: this package ships to the
 * browser, the operations are a fixed handful of documents, and a failure here
 * has to be legible to an operator staring at the monitor's Sync tab -- so
 * every failure mode (transport, HTTP status, GraphQL errors, empty data)
 * becomes one error whose message names the endpoint and the operation, and
 * whose {@link InspectionRequestError.code} carries the server's own
 * `extensions.code` where there is one to carry.
 */
export class GraphqlInspectionTransport {
  private readonly url: string;
  private readonly headers: RemoteInspectionHeaders | undefined;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteInspectionTransportOptions) {
    this.url = options.url;
    this.headers = options.headers;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  /** The endpoint this transport talks to; carried onto the reactor handle. */
  get endpoint(): string {
    return this.url;
  }

  async request<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const extra = this.headers ? await this.headers() : {};

    // Merged through `Headers`, not an object spread: HTTP header names are
    // case-INSENSITIVE, so a provider returning `Content-Type` or `Accept`
    // spread over these defaults produces two of the same header rather than
    // an override, and which one a server reads is then up to its parser.
    // `Headers.set` replaces by canonical name, so a provider always wins.
    const headers = new Headers({
      "content-type": "application/json",
      accept: "application/json",
    });
    for (const [name, value] of Object.entries(extra)) {
      headers.set(name, value);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
      });
    } catch (error) {
      throw new Error(
        `Reactor inspection "${operationName}" could not reach ${this.url}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    if (!response.ok) {
      // Keep the body: a GraphQL validation failure is a 400 whose only
      // description of what went wrong is in there, and a 401/403 is the
      // answer an operator needs to see verbatim.
      const detail = await response.text().catch(() => "");
      throw new InspectionRequestError(
        `Reactor inspection "${operationName}" failed at ${this.url}: ${
          response.status
        }${detail ? ` ${detail}` : ""}`,
        // A 401/403 is the HTTP spelling of the same refusal the GraphQL
        // extension carries, so a caller reacts to one code either way.
        response.status === 401 || response.status === 403
          ? FORBIDDEN_CODE
          : String(response.status),
      );
    }

    let body: GraphqlResponse<T>;
    try {
      body = (await response.json()) as GraphqlResponse<T>;
    } catch (error) {
      throw new Error(
        `Reactor inspection "${operationName}" returned an unreadable body from ${
          this.url
        }: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }

    if (body.errors && body.errors.length > 0) {
      const code =
        body.errors.find((error) => error.extensions?.code)?.extensions?.code ??
        "";
      throw new InspectionRequestError(
        `Reactor inspection "${operationName}": ${body.errors
          .map((error) => error.message)
          .join("; ")}`,
        code,
      );
    }
    if (body.data === undefined || body.data === null) {
      throw new Error(
        `Reactor inspection "${operationName}" returned no data from ${this.url}`,
      );
    }
    return body.data;
  }
}
