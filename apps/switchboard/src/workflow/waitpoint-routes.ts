// A WEBHOOK waitpoint's resume URL: POST resumes, GET on it or `/confirm` serves
// a confirm page. A GET never resumes, so link scanners cannot consume one.
import type {
  WaitpointDescription,
  WaitpointResumePayload,
} from "@powerhousedao/reactor-workflow";
import type {
  IHttpScope,
  RouteMethod,
  ScopedRouteHandle,
  WebhookReply,
} from "@powerhousedao/shared/processors";

export const WAITPOINT_PATH = "waitpoints";
export const MAX_REASON_LENGTH = 2000;
const MAX_BODY_BYTES = 1_048_576;

export interface WaitpointRouteRuntime {
  describeWaitpointByToken(
    token: string,
  ): Promise<WaitpointDescription | undefined>;
  resumeWaitpointByToken(
    token: string,
    payload: WaitpointResumePayload,
  ): Promise<{ status: "resumed" | "already" | "gone" }>;
  // Held until the resumed leg responds, waits again or ends.
  resumeWaitpointByTokenSync(
    token: string,
    payload: WaitpointResumePayload,
  ): Promise<{ status: "resumed" | "already" | "gone"; reply?: WebhookReply }>;
}

type SubPath = "" | "confirm" | "sync";
type Action = "approve" | "disapprove";

const PAGE_HEADERS: Record<string, string> = {
  "content-security-policy":
    "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  "x-content-type-options": "nosniff",
  "cache-control": "no-store",
  // The token is in the URL.
  "referrer-policy": "no-referrer",
};

// Credentials a caller may send that must not be journaled with the payload.
const DROPPED_HEADERS = new Set([
  "authorization",
  "cookie",
  "proxy-authorization",
]);

// Absent when the host knows no public origin: a bare path is no resume URL.
export function waitpointBaseUrlOf(http: IHttpScope): string | undefined {
  const url = `${http.baseUrl.replace(/\/+$/, "")}/${WAITPOINT_PATH}`;
  return URL.canParse(url) ? url : undefined;
}

// Public: the unguessable token in the path is the whole credential.
export function registerWaitpointRoutes(
  http: IHttpScope,
  runtime: WaitpointRouteRuntime,
): ScopedRouteHandle[] {
  const route = (method: RouteMethod[], subPath: SubPath): ScopedRouteHandle =>
    http.route({
      method,
      path: [WAITPOINT_PATH, ":token", subPath].filter(Boolean).join("/"),
      auth: "public",
      maxBodyBytes: MAX_BODY_BYTES,
      handler: (request, ctx) =>
        handleWaitpointRequest(runtime, request, ctx.params.token, subPath),
    });
  return [
    route(["GET", "HEAD", "POST"], ""),
    route(["GET", "HEAD", "POST"], "sync"),
    route(["GET", "HEAD", "POST"], "confirm"),
  ];
}

export async function handleWaitpointRequest(
  runtime: WaitpointRouteRuntime,
  request: Request,
  token: string,
  subPath: SubPath,
): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  const queryParams = Object.fromEntries(url.searchParams);

  if (method === "GET" || method === "HEAD") {
    if (subPath === "confirm") {
      return confirmPage(runtime, token, queryParams, "");
    }
    if (subPath === "") {
      // Relative, so the form posts to `/confirm` behind any proxy prefix.
      const target = url.pathname.endsWith("/")
        ? "confirm"
        : `${encodeURIComponent(token)}/confirm`;
      return confirmPage(runtime, token, queryParams, target);
    }
    return json(405, "Use POST to resume, or open the /confirm page", {
      allow: "POST",
    });
  }

  const headers = headerRecord(request);
  const body = await readBody(request, headers["content-type"]);
  const html = subPath === "confirm" && fromBrowser(headers);
  let payloadBody = body;
  if (subPath === "confirm") {
    const action = queryParams.action;
    if (action !== "approve" && action !== "disapprove") {
      return refuse(
        html,
        400,
        "Nothing was recorded",
        "This link needs to say whether you approve or disapprove. Open it in a browser and use one of the buttons.",
      );
    }
    const reason = readReason(body) || queryParams.reason || undefined;
    if (reason !== undefined && reason.length > MAX_REASON_LENGTH) {
      return refuse(
        html,
        400,
        "Your reason is too long",
        `Keep it under ${MAX_REASON_LENGTH} characters and submit again. Nothing was recorded.`,
      );
    }
    // The reason reads the same from the query string and the body.
    if (reason !== undefined) {
      queryParams.reason = reason;
      payloadBody = {
        ...(body && typeof body === "object" ? (body as object) : {}),
        reason,
      };
    }
  }

  const payload = { body: payloadBody, headers, queryParams };
  if (subPath === "sync") {
    const { status, reply } = await runtime.resumeWaitpointByTokenSync(
      token,
      payload,
    );
    if (status === "resumed" && reply) return replyResponse(reply);
    return status === "resumed"
      ? json(200, recordedMessage(queryParams.action), undefined, status)
      : json(
          status === "already" ? 200 : 410,
          status === "already"
            ? "This request was already responded to."
            : "This request is no longer waiting.",
          undefined,
          status,
        );
  }
  const { status } = await runtime.resumeWaitpointByToken(token, payload);

  if (status === "resumed") {
    const message = recordedMessage(queryParams.action);
    return html
      ? page(200, { title: "Response recorded", message, tone: "done" })
      : json(200, message, undefined, status);
  }
  if (status === "already") {
    return html
      ? page(200, ALREADY)
      : json(200, "This request was already responded to.", undefined, status);
  }
  return html
    ? page(410, EXPIRED)
    : json(410, "This request is no longer waiting.", undefined, status);
}

async function confirmPage(
  runtime: WaitpointRouteRuntime,
  token: string,
  queryParams: Record<string, string>,
  target: string,
): Promise<Response> {
  const described = await runtime.describeWaitpointByToken(token);
  if (!described) {
    return page(404, {
      title: "Link not found",
      message: "This link is not valid, or it has been removed.",
      tone: "closed",
    });
  }
  if (described.status === "COMPLETED" || described.status === "CONSUMED") {
    return page(200, { ...ALREADY, context: described });
  }
  if (described.status === "CANCELLED") {
    return page(200, {
      title: "Run cancelled",
      message: "This run was cancelled. There is nothing left to do here.",
      tone: "closed",
      context: described,
    });
  }
  if (described.status === "EXPIRED") {
    return page(200, { ...EXPIRED, context: described });
  }
  return page(200, {
    title: "Confirm your response",
    message: "This workflow is paused and waiting for your response.",
    tone: "open",
    context: described,
    form: {
      approveUrl: actionUrl(target, queryParams, "approve"),
      disapproveUrl: actionUrl(target, queryParams, "disapprove"),
    },
  });
}

// Relative to the page; an empty target is the confirm page itself.
function actionUrl(
  target: string,
  queryParams: Record<string, string>,
  action: Action,
) {
  const params = new URLSearchParams(queryParams);
  params.set("action", action);
  return `${target}?${params.toString()}`;
}

function headerRecord(request: Request): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, name) => {
    if (!DROPPED_HEADERS.has(name)) headers[name] = value;
  });
  return headers;
}

// JSON and form bodies decoded; anything else as text, an empty one as undefined.
async function readBody(request: Request, contentType = ""): Promise<unknown> {
  const text = await request.text();
  if (text === "") return undefined;
  if (contentType.startsWith("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(text));
  }
  if (contentType.includes("json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

function fromBrowser(headers: Record<string, string>): boolean {
  return (
    (headers["content-type"] ?? "").startsWith(
      "application/x-www-form-urlencoded",
    ) || (headers.accept ?? "").includes("text/html")
  );
}

function readReason(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const reason = (body as Record<string, unknown>).reason;
  return typeof reason === "string" ? reason : undefined;
}

function recordedMessage(action: string | undefined): string {
  if (action === "approve") return "You approved this request.";
  if (action === "disapprove") return "You disapproved this request.";
  return "Your response has been recorded.";
}

function refuse(
  html: boolean,
  status: number,
  title: string,
  message: string,
): Response {
  return html
    ? page(status, { title, message, tone: "closed" })
    : json(status, message);
}

// The resumed run's own answer: what a step responded, or how the leg ended.
function replyResponse(reply: WebhookReply): Response {
  // A null-body status cannot carry one.
  const body = [204, 205, 304].includes(reply.status) ? undefined : reply.body;
  return new Response(body ?? null, {
    status: reply.status,
    headers: {
      "cache-control": "no-store",
      ...reply.headers,
      ...(body !== undefined
        ? { "content-type": reply.contentType ?? "text/plain" }
        : {}),
    },
  });
}

function json(
  status: number,
  message: string,
  headers?: Record<string, string>,
  outcome?: string,
): Response {
  return new Response(
    JSON.stringify(outcome ? { status: outcome, message } : { message }),
    {
      status,
      headers: {
        "content-type": "application/json",
        "cache-control": "no-store",
        ...headers,
      },
    },
  );
}

interface PageContent {
  title: string;
  message: string;
  tone: "open" | "done" | "closed";
  context?: Omit<WaitpointDescription, "status">;
  form?: { approveUrl: string; disapproveUrl: string };
}

const ALREADY: PageContent = {
  title: "Already responded",
  message:
    "This request was already responded to. There is nothing left to do here.",
  tone: "closed",
};

const EXPIRED: PageContent = {
  title: "Request expired",
  message: "This request is no longer waiting for a response.",
  tone: "closed",
};

function page(status: number, content: PageContent): Response {
  return new Response(renderPage(content), {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...PAGE_HEADERS },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const STYLE = `
:root { color-scheme: light dark; --bg: #fafafa; --card: #fff; --fg: #0a0a0a; --muted: #6b7280; --line: #e5e7eb; --ok: #059669; --no: #dc2626; }
@media (prefers-color-scheme: dark) { :root { --bg: #0a0a0a; --card: #171717; --fg: #fafafa; --muted: #a3a3a3; --line: #262626; } }
* { box-sizing: border-box; }
body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--bg); color: var(--fg); font: 14px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
main { width: 440px; max-width: 100%; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
h1 { font-size: 20px; margin: 0 0 8px; }
p { margin: 0 0 16px; color: var(--muted); }
dl { margin: 0 0 16px; padding: 12px; border: 1px solid var(--line); border-radius: 8px; display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
dt { color: var(--muted); } dd { margin: 0; overflow-wrap: anywhere; }
.description { color: var(--fg); white-space: pre-line; }
label { display: block; font-weight: 500; margin-bottom: 4px; }
textarea { width: 100%; min-height: 72px; resize: vertical; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: transparent; color: inherit; font: inherit; }
.actions { display: flex; gap: 8px; margin-top: 16px; }
button { flex: 1; height: 36px; border: 0; border-radius: 8px; color: #fff; font: inherit; font-weight: 500; cursor: pointer; }
.approve { background: var(--ok); } .disapprove { background: var(--no); }
.done h1 { color: var(--ok); }
`;

// No script runs on the page, so times are shown in UTC.
function formatTime(iso: string | undefined): string | undefined {
  if (!iso) return undefined;
  const time = new Date(iso);
  if (Number.isNaN(time.getTime())) return undefined;
  return `${time.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

function contextRows(context: Omit<WaitpointDescription, "status">) {
  const started = formatTime(context.startedAt);
  const rows: [string, string | undefined][] = [
    ["Workflow", context.workflowName || undefined],
    [
      "Step",
      context.actionName &&
      context.actionName.toLowerCase() !== context.stepName.toLowerCase()
        ? `${context.stepName} · ${context.actionName}`
        : context.stepName,
    ],
    [
      "Started",
      started && context.triggerName
        ? `${started}, by ${context.triggerName}`
        : started,
    ],
    ["Waiting since", formatTime(context.waitingSince)],
    ["Expires", formatTime(context.expiresAt)],
  ];
  return rows
    .filter((row): row is [string, string] => row[1] !== undefined)
    .map(([term, value]) => `<dt>${term}</dt><dd>${escapeHtml(value)}</dd>`)
    .join("");
}

function renderPage({ title, message, tone, context, form }: PageContent) {
  const description = context?.workflowDescription
    ? `<p class="description">${escapeHtml(context.workflowDescription)}</p>`
    : "";
  const details = context
    ? `${description}<dl>${contextRows(context)}</dl>`
    : "";
  const actions = form
    ? `<form method="post">
<label for="reason">Reason (optional)</label>
<textarea id="reason" name="reason" maxlength="${MAX_REASON_LENGTH}"></textarea>
<div class="actions">
<button type="submit" class="disapprove" formaction="${escapeHtml(form.disapproveUrl)}">Disapprove</button>
<button type="submit" class="approve" formaction="${escapeHtml(form.approveUrl)}">Approve</button>
</div>
</form>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main class="${tone}">
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(message)}</p>
${details}
${actions}
</main>
</body>
</html>`;
}
