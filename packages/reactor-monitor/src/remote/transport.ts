/** Resolved per request, so a bearer can change without re-provisioning. */
export type RemoteInspectionHeaders = () =>
  | Record<string, string>
  | Promise<Record<string, string>>;

/** How to reach a remote reactor's inspection subgraph. */
export type RemoteInspectionTransportOptions = {
  /** e.g. `https://switchboard.example/graphql/inspection`. */
  url: string;
  /** Bearer or other headers; see {@link RemoteInspectionHeaders}. */
  headers?: RemoteInspectionHeaders;
  /** Defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Bound on one request, headers through body; defaults to 30s. */
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 30_000;

type GraphqlResponse<T> = {
  data?: T;
  errors?: { message: string; extensions?: { code?: string } }[];
};

/** The `extensions.code` reactor-api's inspection refusals carry. */
export const FORBIDDEN_CODE = "FORBIDDEN";

/** A failed inspection request with the server's `extensions.code`, e.g. `FORBIDDEN` for a non-admin caller. */
export class InspectionRequestError extends Error {
  /** The server's `extensions.code`, or `""` when it sent none. */
  readonly code: string;

  constructor(message: string, code: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "InspectionRequestError";
    this.code = code;
  }
}

/** One GraphQL endpoint over `fetch`; every failure names the endpoint and the operation. */
export class GraphqlInspectionTransport {
  private readonly url: string;
  private readonly headers: RemoteInspectionHeaders | undefined;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: RemoteInspectionTransportOptions) {
    this.url = options.url;
    this.headers = options.headers;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  get endpoint(): string {
    return this.url;
  }

  async request<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown> = {},
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Raced as well as signalled: a `fetch` seam may ignore the signal.
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const error = new Error(
          `Reactor inspection "${operationName}" timed out after ${this.timeoutMs}ms at ${this.url}`,
        );
        reject(error);
        controller.abort(error);
      }, this.timeoutMs);
    });
    try {
      return await Promise.race([
        this.send<T>(operationName, query, variables, controller.signal),
        deadline,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async send<T>(
    operationName: string,
    query: string,
    variables: Record<string, unknown>,
    signal: AbortSignal,
  ): Promise<T> {
    const extra = this.headers ? await this.headers() : {};

    // `Headers.set` replaces case-insensitively, so a provider overrides a default.
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
        signal,
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
      // The body explains a 400 or a 401.
      const detail = await response.text().catch(() => "");
      throw new InspectionRequestError(
        `Reactor inspection "${operationName}" failed at ${this.url}: ${
          response.status
        }${detail ? ` ${detail}` : ""}`,
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
