// Core blocks that answer the request a run holds: Stop ends the run, Respond
// and wait for webhook answers with a resume URL and suspends until it is called.
import { createAction, Property } from "@powerhousedao/pieces-framework";
import {
  NEXT_PORT,
  PIECE_ACTION_PORTS,
  STOP_PORTS,
} from "@powerhousedao/pieces-framework/workflow";
import type { RunResponse } from "../activepieces/worker/protocol.js";
import { CoreCannotPauseError, type CoreActionContext } from "./context.js";
import { shownWhen, withHints, withPorts } from "./hints.js";
import { durationMs, unitOptions } from "./waits.js";

// The header that carries the resume URL, as upstream's resume webhook header.
export const RESUME_URL_HEADER = "x-resume-webhook-url";

const REDIRECT_STATUS = 302;

// Upstream's Return Response fields, flattened: the core form shows one body
// prop per response type instead of a dynamic group.
function responseProps(bodyRequired: boolean) {
  return {
    responseType: Property.StaticDropdown({
      displayName: "Response type",
      required: false,
      defaultValue: "json",
      options: {
        options: [
          { value: "json", label: "JSON" },
          { value: "raw", label: "Raw" },
          { value: "redirect", label: "Redirect" },
        ],
      },
    }),
    status: withHints(
      Property.Number({
        displayName: "Status",
        description: "HTTP status; 200 when blank.",
        required: false,
      }),
      shownWhen("responseType", ["json", "raw"]),
    ),
    headers: withHints(
      Property.Object({
        displayName: "Headers",
        required: false,
      }),
      shownWhen("responseType", ["json", "raw"]),
    ),
    body: withHints(
      Property.Json({
        displayName: "JSON body",
        required: bodyRequired,
      }),
      shownWhen("responseType", ["json"]),
    ),
    text: withHints(
      Property.LongText({
        displayName: "Raw body",
        required: bodyRequired,
      }),
      shownWhen("responseType", ["raw"]),
    ),
    redirectUrl: withHints(
      Property.ShortText({
        displayName: "Redirect URL",
        required: true,
      }),
      shownWhen("responseType", ["redirect"]),
    ),
  };
}

// An editor may store an untouched object prop as {}.
const blank = (value: unknown) =>
  value === undefined ||
  value === null ||
  value === "" ||
  (typeof value === "object" && Object.keys(value).length === 0);

function jsonBody(value: unknown, block: string): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    throw new Error(`${block}: the JSON body is not valid JSON`);
  }
}

function headerMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const headers: Record<string, string> = {};
  for (const [name, entry] of Object.entries(value)) {
    if (typeof entry === "string" || typeof entry === "number") {
      headers[name] = String(entry);
    }
  }
  return headers;
}

function withProtocol(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

// The response the props describe; undefined when the author set none.
export function configuredResponse(
  props: Record<string, unknown>,
  block: string,
): RunResponse | undefined {
  const type = blank(props.responseType) ? "json" : props.responseType;
  if (type === "redirect") {
    if (typeof props.redirectUrl !== "string" || !props.redirectUrl.trim()) {
      throw new Error(`${block}: a redirect URL is required`);
    }
    const location = withProtocol(props.redirectUrl.trim());
    return {
      status: REDIRECT_STATUS,
      headers: { location },
      body: location,
    };
  }
  const raw = type === "raw";
  const given = raw ? props.text : props.body;
  if (blank(given) && blank(props.status) && blank(props.headers)) {
    return undefined;
  }
  const status = blank(props.status) ? 200 : Number(props.status);
  return {
    status,
    headers: headerMap(props.headers),
    ...(blank(given)
      ? {}
      : { body: raw ? String(given) : jsonBody(given, block) }),
  };
}

function context(ctx: unknown): CoreActionContext {
  return ctx as CoreActionContext;
}

export const stopAction = withPorts(
  createAction({
    name: "stop",
    displayName: "Stop run",
    description:
      "Ends the run successfully without running further steps. In a run " +
      "that holds a request (a sync webhook or a /sync resume) it answers " +
      "with the response set here, or 200 with {} when none is.",
    requireAuth: false,
    props: responseProps(false),
    run: (raw) => {
      const ctx = context(raw);
      const response = configuredResponse(ctx.propsValue, "Stop run");
      ctx.run.stop(response ? { response } : undefined);
      return Promise.resolve(response ? { response } : {});
    },
  }),
  { ports: STOP_PORTS, portOf: () => NEXT_PORT },
);

// The response with the resume URL in a header, and in a JSON object body
// when the author asked for it.
function withResumeUrl(
  response: RunResponse,
  url: string,
  inBody: boolean,
): RunResponse {
  const body = response.body ?? {};
  const object = typeof body === "object" && !Array.isArray(body);
  return {
    ...response,
    headers: { ...response.headers, [RESUME_URL_HEADER]: url },
    ...(inBody && object
      ? { body: { ...(body as object), resumeUrl: url } }
      : {}),
  };
}

// What resumed the step, as upstream's resumePayload.
function resumeRequest(payload: unknown) {
  const record = (payload ?? {}) as {
    body?: unknown;
    headers?: unknown;
    queryParams?: unknown;
  };
  return {
    body: record.body ?? null,
    headers: record.headers ?? {},
    queryParams: record.queryParams ?? {},
  };
}

export const waitForWebhookAction = withPorts(
  createAction({
    name: "waitForWebhook",
    displayName: "Respond and wait for webhook",
    description:
      "Answers the request the run holds with this response and the step's " +
      `resume URL (in the ${RESUME_URL_HEADER} header, and in a JSON body ` +
      "when asked), then suspends the run until that URL is called. The " +
      "resuming request's body, headers and query are the step's output.",
    requireAuth: false,
    props: {
      ...responseProps(false),
      includeResumeUrl: withHints(
        Property.Checkbox({
          displayName: "Add resumeUrl to the body",
          description:
            "Adds a resumeUrl field to a JSON object body. POST to it to resume; append /sync to wait for the run's answer.",
          required: false,
          defaultValue: true,
        }),
        shownWhen("responseType", ["json"]),
      ),
      expiresAfter: Property.Number({
        displayName: "Expires after",
        description:
          "Ends the run if nobody calls the URL in time; the workflow's maxSuspensionDays still applies.",
        required: false,
      }),
      expiresUnit: Property.StaticDropdown({
        displayName: "Expiry unit",
        required: false,
        defaultValue: "days",
        options: { options: unitOptions },
      }),
    },
    run: async (raw) => {
      const ctx = context(raw);
      if (ctx.executionType === "RESUME") {
        return resumeRequest(ctx.resumePayload);
      }
      const block = "Respond and wait for webhook";
      if (!ctx.run.canPause) throw new CoreCannotPauseError(block);
      const props = ctx.propsValue;
      const response = configuredResponse(props, block) ?? {
        status: 200,
        headers: {},
      };
      const inBody =
        (blank(props.responseType) || props.responseType === "json") &&
        props.includeResumeUrl !== false;
      const expiresMs = durationMs(
        props.expiresAfter,
        props.expiresUnit ?? "days",
        block,
      );
      const waitpoint = await ctx.run.createWaitpoint({
        type: "WEBHOOK",
        responseToSend: (url) => withResumeUrl(response, url, inBody),
        ...(expiresMs
          ? { expiresAt: new Date(Date.now() + expiresMs).toISOString() }
          : {}),
      });
      ctx.run.waitForWaitpoint(waitpoint.id);
      return { resumeUrl: waitpoint.resumeUrl };
    },
  }),
  { ports: PIECE_ACTION_PORTS, portOf: () => NEXT_PORT },
);
