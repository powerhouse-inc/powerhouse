import { ts } from "@tmpl/core";
import type { PieceNames } from "../../file-builders/types.js";

export const pieceClientFileTemplate = (v: PieceNames) =>
  ts`
import type { ${v.pascalCaseName}Credentials } from "./auth-value.js";
import {
  categoryForStatus,
  describeApiError,
  ${v.pascalCaseName}ApiError,
} from "./errors.js";

export type HttpVerb = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  method?: HttpVerb;
  /** Relative to \`<base>/api/\`, e.g. "records/abc123". */
  path: string;
  query?: Record<string, QueryValue>;
  json?: unknown;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;

export class ${v.pascalCaseName}Client {
  constructor(
    readonly credentials: ${v.pascalCaseName}Credentials,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  url(path: string, query?: Record<string, QueryValue>): URL {
    const url = new URL(
      \`\${this.credentials.baseUrl}/api/\${path.replace(/^\/+/, "")}\`,
    );
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === "") continue;
      url.searchParams.append(key, String(value));
    }
    return url;
  }

  async request<T = unknown>(options: RequestOptions): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    let response: Response;
    try {
      response = await this.fetchImpl(this.url(options.path, options.query), {
        method: options.method ?? "GET",
        headers: {
          Accept: "application/json",
          Authorization: \`Token \${this.credentials.token}\`,
          ...(options.json === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        body: options.json === undefined ? undefined : JSON.stringify(options.json),
        signal: controller.signal,
      });
    } catch (error) {
      const aborted = error instanceof Error && error.name === "AbortError";
      throw new ${v.pascalCaseName}ApiError(
        aborted
          ? "The request timed out"
          : \`Could not reach ${v.displayName}: \${String(error)}\`,
        { category: aborted ? "timeout" : "network", retryable: true },
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    const body: unknown = text === "" ? undefined : safeJson(text);
    if (!response.ok) {
      const category = categoryForStatus(response.status);
      throw new ${v.pascalCaseName}ApiError(
        describeApiError(body) ?? \`${v.displayName} answered \${response.status}\`,
        {
          status: response.status,
          category,
          retryable: category === "server" || category === "rate_limit",
          detail: body,
        },
      );
    }
    return body as T;
  }

  /** The cheapest authenticated call there is; the auth's validate uses it. */
  async ping(): Promise<unknown> {
    return await this.request({ path: "" });
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
`.raw;
