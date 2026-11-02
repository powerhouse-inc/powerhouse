import type { z } from "zod";
import type { HostRuleIssue, HostRulesContext } from "../host-rules/schema.js";
import {
  capabilitiesResponseSchema,
  checkResponseSchema,
  CONTROLLER_PREFIX,
  draftCheckResponseSchema,
  errorResponseSchema,
  exportResponseSchema,
  type hostIssueSchema,
  hostsResponseSchema,
  instanceSchema,
  instancesResponseSchema,
  logsResponseSchema,
  projectsResponseSchema,
  TOKEN_HEADER,
  TOKEN_META_NAME,
  type DraftCheckResponse,
  type DraftRequest,
  type ErrorCode,
  type ExportResponse,
  type HostRequest,
  type Instance,
  type LogsResponse,
  type Project,
  type RefusedSetter,
} from "./api.js";

export type HostIssue = z.infer<typeof hostIssueSchema>;

/** A refused or failed controller call. */
export class ControllerRequestError extends Error {
  public constructor(
    public readonly code: ErrorCode | "network" | "bad_response",
    message: string,
    public readonly status?: number,
    public readonly issues?: readonly HostIssue[],
    /** `check_failed` on a draft: its host-rules findings. */
    public readonly ruleIssues?: readonly HostRuleIssue[],
    /** `setter_denied`: every refused setter. */
    public readonly setters?: readonly RefusedSetter[],
  ) {
    super(message);
    this.name = "ControllerRequestError";
  }
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const MAX_BACKOFF_MS = 30_000;

/** `base` doubled per consecutive failure, capped at 30 s. */
export function backoffMs(base: number, failures: number): number {
  return Math.min(base * 2 ** failures, Math.max(base, MAX_BACKOFF_MS));
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ControllerRequestError && error.code === "not_found";
}

export interface ControllerClient {
  projects(): Promise<Project[]>;
  hosts(project: string): Promise<string[]>;
  check(request: HostRequest): Promise<HostIssue[]>;
  start(request: HostRequest): Promise<Instance>;
  capabilities(): Promise<HostRulesContext>;
  /** A project host's declared export, and the digest drafts quote back. */
  exportHost(project: string, host: string): Promise<ExportResponse>;
  checkDraft(request: DraftRequest): Promise<DraftCheckResponse>;
  /** Starts a throwaway copy of the draft's project; poll `get` until running. */
  startDraft(request: DraftRequest): Promise<Instance>;
  list(): Promise<Instance[]>;
  get(id: string): Promise<Instance>;
  logs(id: string, since: number): Promise<LogsResponse>;
  /** A 404 means the controller no longer knows the instance: it is gone. */
  stop(id: string): Promise<Instance | undefined>;
  stopAll(): Promise<Instance[]>;
}

export interface ControllerClientOptions {
  token: string;
  fetch?: typeof fetch;
}

export function createControllerClient(
  options: ControllerClientOptions,
): ControllerClient {
  const doFetch = options.fetch ?? ((input, init) => fetch(input, init));

  const call = async <T>(
    schema: z.ZodType<T>,
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> => {
    let response: Response;
    try {
      response = await doFetch(CONTROLLER_PREFIX + path, {
        method: init.method ?? "GET",
        headers: {
          [TOKEN_HEADER]: options.token,
          ...(init.body === undefined
            ? {}
            : { "Content-Type": "application/json" }),
        },
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
    } catch (error) {
      throw new ControllerRequestError(
        "network",
        `Controller unreachable: ${errorMessage(error)}`,
      );
    }
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ControllerRequestError(
        "bad_response",
        `Controller answered ${response.status} without JSON.`,
        response.status,
      );
    }
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new ControllerRequestError(
          "bad_response",
          `Controller answered ${response.status}.`,
          response.status,
        );
      }
      const { code, message, issues, ruleIssues, setters } = parsed.data.error;
      throw new ControllerRequestError(
        code,
        code === "bad_token"
          ? `${message} The controller restarted; reload the page.`
          : message,
        response.status,
        issues,
        ruleIssues,
        setters,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      throw new ControllerRequestError(
        "bad_response",
        `Unexpected controller response for ${path}.`,
        response.status,
      );
    }
    return parsed.data;
  };

  const instancePath = (id: string) => `instances/${encodeURIComponent(id)}`;

  return {
    projects: async () =>
      (await call(projectsResponseSchema, "projects")).projects,
    hosts: async (project) =>
      (
        await call(
          hostsResponseSchema,
          `hosts?project=${encodeURIComponent(project)}`,
        )
      ).hosts,
    check: async (request) =>
      (
        await call(checkResponseSchema, "check", {
          method: "POST",
          body: request,
        })
      ).issues,
    start: (request) =>
      call(instanceSchema, "instances", { method: "POST", body: request }),
    capabilities: () => call(capabilitiesResponseSchema, "capabilities"),
    exportHost: (project, host) =>
      call(
        exportResponseSchema,
        `export?${new URLSearchParams({ project, host }).toString()}`,
      ),
    checkDraft: (request) =>
      call(draftCheckResponseSchema, "drafts/check", {
        method: "POST",
        body: request,
      }),
    startDraft: (request) =>
      call(instanceSchema, "drafts", { method: "POST", body: request }),
    list: async () =>
      (await call(instancesResponseSchema, "instances")).instances,
    get: (id) => call(instanceSchema, instancePath(id)),
    logs: (id, since) =>
      call(logsResponseSchema, `${instancePath(id)}/logs?since=${since}`),
    stop: async (id) => {
      try {
        return await call(instanceSchema, instancePath(id), {
          method: "DELETE",
        });
      } catch (error) {
        if (isNotFound(error)) return undefined;
        throw error;
      }
    },
    stopAll: async () =>
      (await call(instancesResponseSchema, "instances", { method: "DELETE" }))
        .instances,
  };
}

/** The page's controller, when the server that served it injected a token. */
export function controllerFromDocument(
  doc: Document | undefined = typeof document === "undefined"
    ? undefined
    : document,
): ControllerClient | undefined {
  const token = doc
    ?.querySelector(`meta[name="${TOKEN_META_NAME}"]`)
    ?.getAttribute("content");
  return token ? createControllerClient({ token }) : undefined;
}
