// The probe a sender sends before it will register a webhook endpoint.

// A trigger declares which shape its sender uses; the piece's own onHandshake
// decides the answer. Only "is this a probe" is decided here.
import type { WebhookReply, WebhookRequest } from "@powerhousedao/reactor-api";

export interface PieceHandshake {
  strategy: string;
  paramName?: string;
}

// The framework's four live strategies. HEAD_REQUEST names a method rather
// than a field, so it is the one that does not read `paramName`.
export function handshakeMatches(
  handshake: PieceHandshake,
  request: WebhookRequest,
): boolean {
  if (handshake.strategy === "HEAD_REQUEST") {
    return request.method.toUpperCase() === "HEAD";
  }
  const name = handshake.paramName;

  // A strategy naming no field can never match: treating it as "always" would
  // answer every delivery as a probe and the workflow would never run.
  if (!name) return false;
  switch (handshake.strategy) {
    // Presence, not truthiness: a sender may probe with an empty value, and
    // the indexed types claim a string is always there.
    case "HEADER_PRESENT":
      return Object.hasOwn(request.headers, name.toLowerCase());
    case "QUERY_PRESENT":
      return Object.hasOwn(request.queryParams, name);
    case "BODY_PARAM_PRESENT":
      return (
        typeof request.body === "object" &&
        request.body !== null &&
        !Array.isArray(request.body) &&
        name in (request.body as Record<string, unknown>)
      );
    default:
      return false;
  }
}

// The framework's own default onHandshake is a bare 200, so a hook returning
// nothing is answered that way rather than treated as a refusal.
export function handshakeReply(output: unknown): WebhookReply {
  if (typeof output !== "object" || output === null) return { status: 200 };
  const record = output as Record<string, unknown>;
  const status = typeof record.status === "number" ? record.status : 200;
  const body = record.body;
  if (body === undefined || body === null) return { status };
  if (typeof body === "string") return { status, body };
  return {
    status,
    body: JSON.stringify(body),
    contentType: "application/json",
  };
}
