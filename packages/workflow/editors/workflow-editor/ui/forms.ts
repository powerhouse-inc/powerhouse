// Form descriptors driving property panels; pure data, mirrors the
// ConnectorPropDescriptor shape from reactor-connectors.

export interface BlockFormProp {
  name: string;
  displayName: string;
  type: string;
  required: boolean;
  defaultValue?: unknown;
  staticOptions?: { label: string; value: unknown }[];
  hasDynamicResolver?: boolean;
  description?: string;
  placeholder?: string;
  // Sibling prop names whose values feed the resolver; a change re-runs it.
  refreshers?: string[];
  // Nested shape: ARRAY item fields, or what a DYNAMIC resolver produced.
  properties?: BlockFormProp[];
  // Folded behind "Advanced": fields with a working default, so the common
  // case is short. Opens expanded when set, else live config would be hidden.
  advanced?: boolean;
  // Shown only while a sibling prop holds one of these values; data, not a
  // predicate, so a piece form arriving as JSON can express it too.
  showWhen?: { prop: string; oneOf: unknown[] };
}

export interface BlockForm {
  title: string;
  requireAuth: boolean;
  // Whether the block takes a connection: none hides the field entirely.
  auth?: "none" | "optional" | "required";
  props: BlockFormProp[];
  // Piece triggers only: POLLING | WEBHOOK | APP_WEBHOOK. WEBHOOK triggers
  // are fed by a request, so the panel shows their endpoint URL.
  triggerStrategy?: string;
}

export interface ConnectionSummary {
  id: string;
  name: string;
  connectorId: string;
  authType: string;
  status: string;
  accountLabel: string | null;
}

export interface SecretStat {
  ref: string;
  label: string | null;
  version: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

// Minting seam for PH_SECRET_REF props: the field takes a value and the
// document only ever receives the ref that comes back.
export interface SecretFormService {
  save: (input: {
    ref?: string;
    value: string;
    label: string;
  }) => Promise<SecretStat>;
  stat: (ref: string) => Promise<SecretStat | null>;
}

export interface WebhookEndpoint {
  workflowId: string;
  url: string;
  // False when `url` is a bare path because the reactor has no public origin.
  absoluteUrl: boolean;
  armed: boolean;
  createdAt: string;
}

export interface DesignTimeService {
  getBlockForm: (blockType: string) => Promise<BlockForm | null>;
  loadOptions: (
    blockType: string,
    propName: string,
    input: Record<string, unknown>,
    connectionId?: string,
  ) => Promise<unknown>;
  // Runs the current workflow's piece trigger test hook; sample items back.
  testTrigger?: () => Promise<unknown>;
  // The current workflow's webhook endpoint, for core#webhook triggers.
  webhookEndpoint?: () => Promise<WebhookEndpoint | null>;
  // Backs PH_SECRET_REF props; absent when the runtime refuses secret writes.
  secrets?: SecretFormService;
  // powerhouse/connection documents for the connection picker.
  listConnections?: () => Promise<ConnectionSummary[]>;
  // Drops the cached listing after the picker creates a connection.
  refreshConnections?: () => void;
}

// Ours, not the piece's: the reactor's poll cadence for a piece trigger.
// Appended to every piece trigger's form; see splitPollInterval in the runtime.
export const POLL_INTERVAL_PROP: BlockFormProp = {
  name: "pollEverySeconds",
  displayName: "Poll every (seconds)",
  type: "NUMBER",
  required: false,
  description:
    "How often the reactor checks this trigger; 60 at the least. Omit to follow the piece's own cadence.",
};

const text = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "SHORT_TEXT",
  required,
  description,
});



// Takes a secret VALUE and commits only the minted ref, the way the
// connection editor's SecretField does; the document never holds the value.
const secretRef = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "PH_SECRET_REF",
  required,
  description,
});

const number = (
  name: string,
  displayName: string,
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "NUMBER",
  required,
  description,
});

// Marks a prop for the "Advanced" section without repeating the builders.
const advanced = (prop: BlockFormProp): BlockFormProp => ({
  ...prop,
  advanced: true,
});

// Hides a prop until a sibling holds one of `oneOf`.
const shownWhen = (
  prop: BlockFormProp,
  sibling: string,
  oneOf: unknown[],
): BlockFormProp => ({ ...prop, showWhen: { prop: sibling, oneOf } });

const dropdown = (
  name: string,
  displayName: string,
  options: { label: string; value: unknown }[],
  required = false,
  description?: string,
): BlockFormProp => ({
  name,
  displayName,
  type: "STATIC_DROPDOWN",
  required,
  description,
  staticOptions: options,
});

// Every scheme that verifies a signature, and so needs a secret.
const SIGNED_SCHEMES = ["token", "hmac", "hmac-prefixed", "hmac-timestamped"];

// Schemes that compute a digest, and so take a hash and an encoding. `token`
// presents the secret verbatim, so none of that applies to it.
const HMAC_SCHEMES = ["hmac", "hmac-prefixed", "hmac-timestamped"];

// Hand-written forms for core blocks and triggers.
export const CORE_FORMS: Record<string, BlockForm> = {
  "core#manual": {
    title: "Manual trigger",
    requireAuth: false,
    auth: "none",
    props: [],
  },
  "core#schedule": {
    title: "Schedule",
    requireAuth: false,
    auth: "none",
    props: [
      dropdown(
        "mode",
        "Mode",
        [
          { label: "Cron expression", value: "cron" },
          { label: "Fixed interval", value: "interval" },
        ],
        true,
      ),
      text(
        "cron",
        "Cron expression",
        false,
        "Five fields, e.g. 0 9 * * 1-5 (09:00 on weekdays); cron mode only",
      ),
      number(
        "every",
        "Every",
        false,
        "Interval mode only; at least one minute",
      ),
      dropdown("unit", "Unit", [
        { label: "Minutes", value: "minutes" },
        { label: "Hours", value: "hours" },
        { label: "Days", value: "days" },
      ]),
      text(
        "timezone",
        "Timezone",
        false,
        "IANA name, e.g. Europe/Lisbon; defaults to UTC",
      ),
    ],
  },
  "core#webhook": {
    title: "Webhook",
    requireAuth: false,
    auth: "none",
    props: [
      dropdown(
        "methods",
        "Method",
        [
          { label: "POST", value: "POST" },
          { label: "Any", value: "ANY" },
          { label: "GET", value: "GET" },
          { label: "PUT", value: "PUT" },
          { label: "PATCH", value: "PATCH" },
          { label: "DELETE", value: "DELETE" },
        ],
        true,
      ),
      // Named by wire format, not by sender: authors match these against their
      // sender's docs, and one brand name would mislead about every other.
      dropdown(
        "scheme",
        "Verification",
        [
          { label: "None — the URL's token only", value: "none" },
          { label: "Shared token in a header", value: "token" },
          { label: "HMAC digest", value: "hmac" },
          {
            label: "HMAC digest with a label (sha256=…)",
            value: "hmac-prefixed",
          },
          {
            label: "HMAC digest, timestamped (t=…,v1=…)",
            value: "hmac-timestamped",
          },
        ],
        true,
      ),
      // Hidden while the scheme is None: a visible secret field on an
      // unverified endpoint invites a secret that is never checked.
      shownWhen(
        secretRef(
          "secretRef",
          "Secret",
          true,
          "The shared secret: the value the header must equal, or the key the sender signs with",
        ),
        "scheme",
        SIGNED_SCHEMES,
      ),
      advanced(
        shownWhen(
          text(
            "header",
            "Header",
            false,
            "Where the token or signature is read from. Defaults to the header the chosen scheme conventionally uses; set it only if the sender differs",
          ),
          "scheme",
          SIGNED_SCHEMES,
        ),
      ),
      advanced(
        shownWhen(
          number(
            "toleranceSeconds",
            "Replay window (seconds)",
            false,
            "Rejects a delivery signed longer ago than this, so a captured request expires. Default 300",
          ),
          "scheme",
          ["hmac-timestamped"],
        ),
      ),
      // The layout frames the signature; these say how its digest was computed.
      // Senders pick them independently, so they are fields, not scheme names.
      advanced(
        shownWhen(
          dropdown("algorithm", "Hash", [
            { label: "SHA-256 (default)", value: "sha256" },
            { label: "SHA-1", value: "sha1" },
            { label: "SHA-512", value: "sha512" },
          ]),
          "scheme",
          HMAC_SCHEMES,
        ),
      ),
      advanced(
        shownWhen(
          dropdown("encoding", "Digest encoding", [
            { label: "Hexadecimal (default)", value: "hex" },
            { label: "Base64", value: "base64" },
          ]),
          "scheme",
          HMAC_SCHEMES,
        ),
      ),
      advanced(
        shownWhen(
          text(
            "prefix",
            "Signature label",
            false,
            "The literal before the digest. Defaults to the hash and an equals sign, e.g. sha256=. Leave blank for a sender that sends the digest with no label",
          ),
          "scheme",
          ["hmac-prefixed"],
        ),
      ),
      advanced(
        text(
          "dedupeField",
          "Event id field",
          false,
          "Where the sender puts its own event id, so a redelivery is accepted without a second run. A bare name reads a query param or a top-level body field; prefix with header: or body: to read a header or a nested path (header:x-delivery-id, body:data.object.id)",
        ),
      ),
      advanced(
        number(
          "dedupeTtlSeconds",
          "Dedupe window (seconds)",
          false,
          "How long an event id is remembered. Default 300",
        ),
      ),
      advanced(
        text(
          "challengeField",
          "Challenge field",
          false,
          "Echo this field back instead of running, for senders that verify the endpoint before registering it. Same header:/body: prefixes as the event id field",
        ),
      ),
      advanced(
        dropdown(
          "responseMode",
          "Response",
          [
            { label: "Answer immediately (202)", value: "async" },
            { label: "Wait for the run (200)", value: "sync" },
          ],
          false,
          "Waiting holds the sender's socket open for the whole run",
        ),
      ),
      advanced(
        number(
          "responseStatus",
          "Success status",
          false,
          "Status returned on acceptance. Default 202 async, 200 sync",
        ),
      ),
    ],
  },
  "core#branch": {
    title: "Branch",
    requireAuth: false,
    auth: "none",
    props: [
      text(
        "condition",
        "Condition",
        true,
        "e.g. {{steps.fetch.output.body.ok}}",
      ),
      text(
        "equals",
        "Equals",
        false,
        "Take the true port only when the condition matches this; omit for truthiness",
      ),
    ],
  },
  "core#assert": {
    title: "Assert",
    requireAuth: false,
    auth: "none",
    props: [
      text(
        "value",
        "Value",
        true,
        "e.g. {{steps.describe.output}} - the run fails when it is blank",
      ),
      {
        name: "rejectValues",
        displayName: "Rejected values",
        type: "ARRAY",
        required: false,
        description:
          "One per line; the run fails when the value matches any of them",
      },
      {
        name: "allowValues",
        displayName: "Allowed values",
        type: "ARRAY",
        required: false,
        description:
          "One per line; when set, anything else fails. Safer than a reject list for model output",
      },
      {
        name: "allowEmpty",
        displayName: "Allow empty",
        type: "CHECKBOX",
        required: false,
        description: "Accept a blank value instead of failing",
      },
      text("message", "Failure message", false, "Replaces the default error"),
    ],
  },
};
