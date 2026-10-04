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
  errors?: { message: string }[];
};

/**
 * One GraphQL endpoint, spoken to over `fetch`.
 *
 * Deliberately not a GraphQL client library: this package ships to the
 * browser, the operations are a fixed handful of documents, and a failure here
 * has to be legible to an operator staring at the monitor's Sync tab -- so
 * every failure mode (transport, HTTP status, GraphQL errors, empty data)
 * becomes one `Error` whose message names the endpoint and the operation.
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

    let response: Response;
    try {
      response = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...extra,
        },
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
      throw new Error(
        `Reactor inspection "${operationName}" failed at ${this.url}: ${
          response.status
        }${detail ? ` ${detail}` : ""}`,
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
      throw new Error(
        `Reactor inspection "${operationName}": ${body.errors
          .map((error) => error.message)
          .join("; ")}`,
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
