// The core triggers. The host feeds them, the way the reactor piece's document
// triggers are fed: schedule.ts, webhook.ts and the manual fire mutation.
import {
  createTrigger,
  Property,
  TriggerStrategy,
} from "@powerhousedao/pieces-framework";
import {
  SCHEDULE_MODES,
  SCHEDULE_UNIT_MS,
} from "@powerhousedao/pieces-framework/workflow";
import { shownWhen, withDisplay, withHints } from "./hints.js";

// A hook that runs would mean the host stopped feeding this trigger.
function hostFed(name: string): () => Promise<never> {
  return () =>
    Promise.reject(
      new Error(`The "${name}" trigger is fired by the host, not by its hooks`),
    );
}

const hooks = (name: string) => ({
  onEnable: hostFed(name),
  onDisable: hostFed(name),
  run: hostFed(name),
});

const options = (entries: [value: string, label: string][]) => ({
  options: entries.map(([value, label]) => ({ value, label })),
});

export const scheduleTrigger = withDisplay(
  createTrigger({
    name: "schedule",
    displayName: "Schedule",
    description:
      "Fires on a five-field cron expression, or every so many minutes, hours or days.",
    type: TriggerStrategy.POLLING,
    requireAuth: false,
    props: {
      mode: Property.StaticDropdown({
        displayName: "Runs",
        description: "cron or interval.",
        required: true,
        defaultValue: "cron",
        options: options([
          [SCHEDULE_MODES[0], "On a cron schedule"],
          [SCHEDULE_MODES[1], "At a fixed interval"],
        ]),
      }),
      cron: withHints(
        Property.ShortText({
          displayName: "Cron expression",
          description:
            "Five fields, e.g. 0 9 * * 1-5 runs at 09:00 on weekdays.",
          required: true,
          defaultValue: "0 9 * * 1-5",
        }),
        shownWhen("mode", ["cron"]),
      ),
      every: withHints(
        Property.Number({
          displayName: "Every",
          description: "A whole number of units, at least 1.",
          required: true,
          defaultValue: 15,
        }),
        shownWhen("mode", ["interval"]),
      ),
      unit: withHints(
        Property.StaticDropdown({
          displayName: "Unit",
          description: "minutes, hours or days.",
          required: true,
          defaultValue: "minutes",
          options: {
            options: Object.keys(SCHEDULE_UNIT_MS).map((unit) => ({
              value: unit,
              label: unit.charAt(0).toUpperCase() + unit.slice(1),
            })),
          },
        }),
        shownWhen("mode", ["interval"]),
      ),
      timezone: Property.ShortText({
        displayName: "Timezone",
        description: "An IANA name such as Europe/Lisbon. Defaults to UTC.",
        required: false,
        defaultValue: "UTC",
      }),
    },
    sampleData: {
      scheduledFor: "2026-09-28T09:00:00.000Z",
      firedAt: "2026-09-28T09:00:00.120Z",
      timezone: "UTC",
      cron: "0 9 * * 1-5",
    },
    ...hooks("schedule"),
  }),
  "schedule",
);

// Every scheme that verifies a signature, and so needs a secret.
const SIGNED_SCHEMES = ["token", "hmac", "hmac-prefixed", "hmac-timestamped"];

// Schemes that compute a digest, and so take a hash and an encoding.
const HMAC_SCHEMES = ["hmac", "hmac-prefixed", "hmac-timestamped"];

// A managed secret's ref, drawn as a secret picker rather than a text field.
const SECRET_REF_TYPE = "PH_SECRET_REF";

export const webhookTrigger = createTrigger({
  name: "webhook",
  displayName: "Webhook",
  description:
    "Fires on an HTTP delivery to the workflow's endpoint. Ask for the URL " +
    "with the webhookEndpoint query rather than constructing it.",
  type: TriggerStrategy.WEBHOOK,
  requireAuth: false,
  props: {
    methods: Property.StaticDropdown({
      displayName: "Method",
      description: "The HTTP method a delivery must use.",
      required: true,
      defaultValue: "POST",
      options: options([
        ["POST", "POST"],
        ["ANY", "Any"],
        ["GET", "GET"],
        ["PUT", "PUT"],
        ["PATCH", "PATCH"],
        ["DELETE", "DELETE"],
      ]),
    }),
    // Named by wire format, not by sender: one brand name would mislead.
    scheme: Property.StaticDropdown({
      displayName: "Verification",
      description: "How a delivery proves its sender.",
      required: true,
      defaultValue: "none",
      options: options([
        ["none", "None — the URL's token only"],
        ["token", "Shared token in a header"],
        ["hmac", "HMAC digest"],
        ["hmac-prefixed", "HMAC digest with a label (sha256=…)"],
        ["hmac-timestamped", "HMAC digest, timestamped (t=…,v1=…)"],
      ]),
    }),
    // Hidden while unverified: a secret there would never be checked.
    secretRef: withHints(
      {
        ...Property.ShortText({
          displayName: "Secret",
          description:
            "The shared secret: the value the header must equal, or the key the sender signs with",
          required: true,
        }),
        type: SECRET_REF_TYPE as never,
      },
      shownWhen("scheme", SIGNED_SCHEMES),
    ),
    header: withHints(
      Property.ShortText({
        displayName: "Header",
        description:
          "Where the token or signature is read from. Defaults to the header the chosen scheme conventionally uses; set it only if the sender differs",
        required: false,
        advanced: true,
      }),
      shownWhen("scheme", SIGNED_SCHEMES),
    ),
    toleranceSeconds: withHints(
      Property.Number({
        displayName: "Replay window (seconds)",
        description:
          "Rejects a delivery signed longer ago than this, so a captured request expires. Default 300",
        required: false,
        advanced: true,
      }),
      shownWhen("scheme", ["hmac-timestamped"]),
    ),
    algorithm: withHints(
      Property.StaticDropdown({
        displayName: "Hash",
        description: "How the digest was computed.",
        required: false,
        advanced: true,
        options: options([
          ["sha256", "SHA-256 (default)"],
          ["sha1", "SHA-1"],
          ["sha512", "SHA-512"],
        ]),
      }),
      shownWhen("scheme", HMAC_SCHEMES),
    ),
    encoding: withHints(
      Property.StaticDropdown({
        displayName: "Digest encoding",
        description: "How the digest is written.",
        required: false,
        advanced: true,
        options: options([
          ["hex", "Hexadecimal (default)"],
          ["base64", "Base64"],
        ]),
      }),
      shownWhen("scheme", HMAC_SCHEMES),
    ),
    prefix: withHints(
      Property.ShortText({
        displayName: "Signature label",
        description:
          "The text before the digest. Left empty it is the hash name and an equals sign, e.g. sha256=. Tick No label when the sender sends the digest alone",
        required: false,
        advanced: true,
      }),
      { emptyChoice: "No label", ...shownWhen("scheme", ["hmac-prefixed"]) },
    ),
    dedupeField: Property.ShortText({
      displayName: "Event id field",
      description:
        "Where the sender puts its own event id, so a redelivery is accepted without a second run. A bare name reads a query param or a top-level body field; prefix with header: or body: to read a header or a nested path (header:x-delivery-id, body:data.object.id)",
      required: false,
      advanced: true,
    }),
    dedupeTtlSeconds: Property.Number({
      displayName: "Dedupe window (seconds)",
      description: "How long an event id is remembered. Default 300",
      required: false,
      advanced: true,
    }),
    challengeField: Property.ShortText({
      displayName: "Challenge field",
      description:
        "Echo this field back instead of running, for senders that verify the endpoint before registering it. Same header:/body: prefixes as the event id field",
      required: false,
      advanced: true,
    }),
    responseMode: Property.StaticDropdown({
      displayName: "Response",
      description: "Waiting holds the sender's socket open for the whole run",
      required: false,
      advanced: true,
      defaultValue: "async",
      options: options([
        ["async", "Answer immediately (202)"],
        ["sync", "Wait for the run (200)"],
      ]),
    }),
    responseStatus: Property.Number({
      displayName: "Success status",
      description: "Status returned on acceptance. Default 202 async, 200 sync",
      required: false,
      advanced: true,
    }),
  },
  sampleData: {
    method: "POST",
    path: "/",
    headers: { "content-type": "application/json" },
    queryParams: {},
    body: { event: "ping" },
  },
  ...hooks("webhook"),
});

export const manualTrigger = createTrigger({
  name: "manual",
  displayName: "Manual",
  description:
    "Fires only when something asks it to, with the fire mutation. The trigger " +
    "to use for a workflow driven by a test or a script.",
  type: TriggerStrategy.MANUAL,
  requireAuth: false,
  props: {},
  sampleData: null,
  ...hooks("manual"),
});
