// `ctx.server.apiUrl` as a piece sees it. A fetch to this origin is answered by
// the host over the call channel, so it needs no network, egress or public URL.
import { UnsupportedContextMemberError } from "../context/stubs.js";
import { callHost } from "./host-call.js";
import {
  FLOWS_LIST,
  HOST_HTTP,
  HOST_ORIGIN,
  type HostHttpRequest,
  type HostHttpResponse,
  type HostServerContext,
} from "./protocol.js";

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function urlOf(input: unknown): string | undefined {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  if (input instanceof Request) return input.url;
  return undefined;
}

function isHostUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === HOST_ORIGIN;
  } catch {
    return false;
  }
}

async function hostFetch(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const body = request.body ? await request.text() : undefined;
  const call: HostHttpRequest = {
    method: request.method,
    path: `${url.pathname}${url.search}`,
    headers: Object.fromEntries(request.headers),
    ...(body !== undefined ? { body } : {}),
  };
  const reply = await callHost<HostHttpResponse>(HOST_HTTP, call);
  return new Response(
    NULL_BODY_STATUSES.has(reply.status) ? null : (reply.body ?? null),
    { status: reply.status, headers: reply.headers },
  );
}

let installed = false;

// Installed once per child, before any piece module loads.
export function installHostFetch(): void {
  if (installed) return;
  installed = true;
  const native = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (input, init) =>
    isHostUrl(urlOf(input))
      ? hostFetch(new Request(input, init))
      : native(input, init);
}

// `ctx.server` for a request the host serves flows to; `token` is not served.
export function hostServerContext(context: HostServerContext) {
  return {
    apiUrl: HOST_ORIGIN,
    publicUrl: context.publicUrl ?? HOST_ORIGIN,
    get token(): string {
      throw new UnsupportedContextMemberError("server.token");
    },
  };
}

// `ctx.flows` provider over the call channel.
export const hostFlows = {
  list: (params?: { externalIds?: string[] }) =>
    callHost<{ data: unknown[] }>(FLOWS_LIST, params ?? {}),
};
