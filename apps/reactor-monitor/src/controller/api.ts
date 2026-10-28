import {
  hostExportSchema,
  type HostExport,
  type HostIssue,
} from "@powerhousedao/host-core/schema";
import { z } from "zod";
import {
  hostRulesContextSchema,
  RULES,
  setterSchema,
  type HostRuleIssue,
} from "../host-rules/schema.ts";

/** Every controller route lives under this prefix. */
export const CONTROLLER_PREFIX = "/__ph-monitor/";
export const TOKEN_HEADER = "x-ph-monitor-token";
/** `<meta name=… content=token>`: present only when a controller is mounted. */
export const TOKEN_META_NAME = "ph-monitor-controller";

export const ENV_KEY_PATTERN = /^[A-Z_][A-Z0-9_]*$/;
export const MAX_ENV_ENTRIES = 64;
export const MAX_ENV_VALUE_LENGTH = 8192;

/** Env keys a browser may set: flags and settings that load or run no code. */
export const BROWSER_ENV_ALLOWLIST = {
  keys: [
    "ADMINS",
    "ATTACHMENT_READS_FOLLOW_DOCUMENT_POLICY",
    "AUTH_ENABLED",
    "CREATE_SIGNATURE_POLICY",
    "DEFAULT_PROTECTION",
    "DOCUMENT_MODEL_SUBGRAPHS_ENABLED",
    "DOCUMENT_PERMISSIONS_ENABLED",
    "LOG_LEVEL",
    "MCP_ENABLED",
    "PH_INSPECTION_CALLS_PER_MINUTE",
    "REQUIRE_AUTHENTICATED_CALLER",
    "RESOLVE_CALLER_IDENTITY",
  ],
  prefixes: ["REACTOR_", "INSPECTION_"],
} as const;

/** Never browser-settable, even under an allowed prefix. */
export const CODE_LOADING_ENV =
  /PATH|PRELOAD|LOADER|PACKAGE|REGISTRY|MODULE|PLUGIN|DYNAMIC|^NODE_|^LD_|^DYLD_|^NPM_/;

export function isBrowserEnvKey(key: string): boolean {
  if (!ENV_KEY_PATTERN.test(key) || CODE_LOADING_ENV.test(key)) return false;
  const { keys, prefixes } = BROWSER_ENV_ALLOWLIST;
  return (
    (keys as readonly string[]).includes(key) ||
    prefixes.some((prefix) => key.startsWith(prefix))
  );
}

export const envSchema = z
  .record(
    z.string().regex(ENV_KEY_PATTERN),
    z.string().max(MAX_ENV_VALUE_LENGTH),
  )
  .refine((env) => Object.keys(env).length <= MAX_ENV_ENTRIES, {
    message: `at most ${MAX_ENV_ENTRIES} env entries`,
  });

const projectField = z.string().min(1).max(4096);
const hostField = z.string().min(1).max(255);

/** `project` is a root from `GET projects`; `host` a folder under its hosts/. */
export const hostRequestSchema = z.strictObject({
  project: projectField,
  host: hostField,
  env: envSchema.optional(),
});
export type HostRequest = z.infer<typeof hostRequestSchema>;

/** Lowercase hex sha256 of a host export; see `baseDigest`. */
export const baseDigestSchema = z.string().regex(/^[0-9a-f]{64}$/);

function sortedKeys(_key: string, value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
  );
}

/**
 * sha256 of the export's JSON with object keys sorted. A `hostExportSchema`
 * parse returns the same structure, so parsed and raw exports hash alike.
 * Needs WebCrypto: Node, or a secure context (loopback is one).
 */
export async function baseDigest(envelope: HostExport): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(envelope, sortedKeys));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

/** `GET capabilities`: what the controller can offer a host it builds. */
export const capabilitiesResponseSchema = hostRulesContextSchema;
export type CapabilitiesResponse = z.input<typeof capabilitiesResponseSchema>;

/** `GET export?project&host`: the host's declared export and its digest. */
export const exportResponseSchema = z.object({
  export: hostExportSchema,
  baseDigest: baseDigestSchema,
});
export type ExportResponse = z.infer<typeof exportResponseSchema>;

/**
 * `POST drafts/check` (→ `draftCheckResponseSchema`) and `POST drafts`
 * (→ `Instance`): the project host's export with `setters` applied in order.
 * `baseDigest` is the export the setters were written against; a different
 * current export is refused as `base_changed`.
 */
export const draftRequestSchema = z.strictObject({
  project: projectField,
  host: hostField,
  baseDigest: baseDigestSchema,
  setters: z.array(setterSchema),
  env: envSchema.optional(),
});
export type DraftRequest = z.infer<typeof draftRequestSchema>;

export const projectSchema = z.object({
  root: z.string(),
  name: z.string(),
});
export type Project = z.infer<typeof projectSchema>;

export const projectsResponseSchema = z.object({
  projects: z.array(projectSchema),
});
export const hostsResponseSchema = z.object({ hosts: z.array(z.string()) });

export const hostIssueSchema = z.object({
  stage: z.enum(["load", "declared", "resolve", "resolved", "boot"]),
  file: z.string(),
  path: z.string(),
  message: z.string(),
  hint: z.string().optional(),
});
export const checkResponseSchema = z.object({
  issues: z.array(hostIssueSchema),
});
export type CheckResponse = z.infer<typeof checkResponseSchema>;

/** A host-rules finding (`validateDraft`); `path` is envelope-rooted. */
export const hostRuleIssueSchema = z.object({
  rule: z.enum(RULES),
  path: z.string(),
  message: z.string(),
  file: z.string().optional(),
  hint: z.string().optional(),
});

/** `POST drafts/check`: the host-rules findings, then `checkHost`'s stages. */
export const draftCheckResponseSchema = z.object({
  ruleIssues: z.array(hostRuleIssueSchema),
  issues: z.array(hostIssueSchema),
});
export type DraftCheckResponse = z.infer<typeof draftCheckResponseSchema>;

/** DELETE forgets an instance; failed and exited ones stay listed until then. */
export const instanceStatusSchema = z.enum([
  "starting",
  "running",
  "stopping",
  "exited",
  "failed",
]);
export type InstanceStatus = z.infer<typeof instanceStatusSchema>;

export const instanceOutputsSchema = z.object({
  origin: z.string(),
  graphql: z.string(),
  drives: z.record(z.string(), z.object({ id: z.string(), url: z.string() })),
});
export type InstanceOutputs = z.infer<typeof instanceOutputsSchema>;

/** A compound's member, keyed by its child key; `host` is its folder. */
export const instanceMemberSchema = z.object({
  host: z.string(),
  outputs: instanceOutputsSchema.optional(),
  /** A Connect member's app URL. */
  app: z.string().optional(),
});
export type InstanceMember = z.infer<typeof instanceMemberSchema>;

export const instanceSchema = z.object({
  id: z.string(),
  project: z.string(),
  host: z.string(),
  status: instanceStatusSchema,
  startedAt: z.string(),
  pid: z.number().int().optional(),
  outputs: instanceOutputsSchema.optional(),
  /** A standalone Connect's app URL. */
  app: z.string().optional(),
  /** A compound's members; `outputs` above is a standalone host's only. */
  members: z.record(z.string(), instanceMemberSchema).optional(),
  /** A draft's project host; `project` above is then the throwaway copy. */
  source: z.object({ project: z.string(), host: z.string() }).optional(),
  exit: z
    .object({
      code: z.number().int().nullable(),
      signal: z.string().nullable(),
      forced: z.boolean(),
    })
    .optional(),
  error: z
    .object({ message: z.string(), phase: z.string(), tail: z.string() })
    .optional(),
});
export type Instance = z.infer<typeof instanceSchema>;

export const instancesResponseSchema = z.object({
  instances: z.array(instanceSchema),
});

export const logLineSchema = z.object({
  seq: z.number().int(),
  stream: z.enum(["stdout", "stderr"]),
  text: z.string(),
});
export type LogLine = z.infer<typeof logLineSchema>;

/** Lines with `seq >= since`; pass `next` as the following `since`. */
export const logsResponseSchema = z.object({
  next: z.number().int(),
  lines: z.array(logLineSchema),
});
export type LogsResponse = z.infer<typeof logsResponseSchema>;

export const refusedSetterSchema = z.object({
  path: z.string(),
  reason: z.string(),
  hint: z.string().optional(),
});
export type RefusedSetter = z.infer<typeof refusedSetterSchema>;

export const errorCodeSchema = z.enum([
  "bad_host",
  "bad_origin",
  "bad_token",
  "bad_request",
  "not_found",
  "unknown_project",
  "unknown_host",
  "env_denied",
  "check_failed",
  "setter_denied",
  "base_changed",
  "instance_limit",
  "shutting_down",
  "internal",
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  error: z.object({
    code: errorCodeSchema,
    message: z.string(),
    issues: z.array(hostIssueSchema).optional(),
    /** `check_failed` on a draft: its host-rules findings. */
    ruleIssues: z.array(hostRuleIssueSchema).optional(),
    /** `setter_denied`: every refused setter, not just the first. */
    setters: z.array(refusedSetterSchema).optional(),
  }),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

// The wire shape must stay assignable both ways to host-core's HostIssue.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const sameIssue: Same<z.infer<typeof hostIssueSchema>, HostIssue> = true;
void sameIssue;
const sameRuleIssue: Same<
  z.infer<typeof hostRuleIssueSchema>,
  HostRuleIssue
> = true;
void sameRuleIssue;
