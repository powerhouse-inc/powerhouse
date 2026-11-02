// Sub-flows: Activepieces' Call Flow, Callable Flow and Return Response, served
// in process. A piece's fetch to ctx.server.apiUrl arrives here as a host call.
import type { WorkflowState } from "@powerhousedao/workflow/document-models/workflow";
import {
  HOST_ORIGIN,
  type HostHttpRequest,
  type HostHttpResponse,
} from "../pieces/index.js";
import { runnableDefinition } from "./runnable.js";

export {
  CALL_FLOW_ACTION,
  CALLABLE_FLOW_TRIGGER,
  isCallableFlow,
  SUBFLOWS_PIECE,
} from "@powerhousedao/pieces-framework/workflow";

// Activepieces' own header names (PARENT_RUN_ID_HEADER and its sibling).
export const PARENT_RUN_HEADER = "ap-parent-run-id";
export const FAIL_PARENT_HEADER = "ap-fail-parent-on-failure";

const WAITPOINTS_PATH = "/v1/waitpoints/";

// Where Call Flow's resume URLs live: the host origin, served in process.
export const HOST_WAITPOINTS_URL = `${HOST_ORIGIN}/v1/waitpoints`;

// Activepieces' PopulatedFlow, the shape `ctx.flows.list` answers with.
export interface PopulatedFlow {
  id: string;
  externalId: string;
  status: "ENABLED" | "DISABLED";
  version: {
    id: string;
    displayName: string;
    trigger: {
      type: "PIECE_TRIGGER" | "EMPTY";
      settings: {
        pieceName?: string;
        pieceVersion?: string;
        triggerName?: string;
        input: Record<string, unknown>;
      };
    };
  };
}

export type HostRoute =
  | { kind: "webhook"; workflowId: string }
  | { kind: "callback"; token: string };

// POST /v1/webhooks/:workflowId and POST /v1/waitpoints/:token.
export function hostRoute(request: HostHttpRequest): HostRoute | undefined {
  if (request.method.toUpperCase() !== "POST") return undefined;
  const { pathname } = new URL(request.path, HOST_ORIGIN);
  const [version, kind, id, ...rest] = pathname
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent);
  if (version !== "v1" || !id || rest.length > 0) return undefined;
  if (kind === "webhooks") return { kind: "webhook", workflowId: id };
  if (kind === "waitpoints") return { kind: "callback", token: id };
  return undefined;
}

export function hostBody(request: HostHttpRequest): unknown {
  if (request.body === undefined || request.body === "") return undefined;
  const type = request.headers["content-type"] ?? "";
  if (!type.includes("json")) return request.body;
  try {
    return JSON.parse(request.body) as unknown;
  } catch {
    return request.body;
  }
}

export function jsonReply(status: number, body: unknown): HostHttpResponse {
  return {
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// A resume URL this host minted, as the host origin serves it to a piece:
// the callee's Return Response then resumes the caller in process.
export function localCallback(
  callbackUrl: string,
  resumeBaseUrl: string | undefined,
): { url: string; token: string } | undefined {
  const fromHost = callbackUrl.startsWith(`${HOST_ORIGIN}${WAITPOINTS_PATH}`);
  const base = fromHost
    ? `${HOST_ORIGIN}${WAITPOINTS_PATH}`
    : resumeBaseUrl
      ? `${resumeBaseUrl.replace(/\/+$/, "")}/`
      : undefined;
  if (!base || !callbackUrl.startsWith(base)) return undefined;
  const token = callbackUrl.slice(base.length).split(/[/?#]/)[0];
  if (!token) return undefined;
  return { url: `${HOST_ORIGIN}${WAITPOINTS_PATH}${token}`, token };
}

export function populatedFlow(
  workflowId: string,
  state: WorkflowState,
  documentName: string | undefined,
): PopulatedFlow {
  const runnable = runnableDefinition(state);
  const trigger = runnable.trigger;
  const config = trigger?.config;
  return {
    id: workflowId,
    externalId: workflowId,
    status:
      state.status === "ENABLED" && runnable.published ? "ENABLED" : "DISABLED",
    version: {
      id: `${workflowId}@${runnable.version}`,
      displayName: state.name || documentName || workflowId,
      trigger: trigger
        ? {
            type: "PIECE_TRIGGER",
            settings: {
              pieceName: trigger.pieceName,
              pieceVersion: trigger.pieceVersion,
              triggerName: trigger.triggerName,
              input:
                config && typeof config === "object" && !Array.isArray(config)
                  ? (config as Record<string, unknown>)
                  : {},
            },
          }
        : { type: "EMPTY", settings: { input: {} } },
    },
  };
}
