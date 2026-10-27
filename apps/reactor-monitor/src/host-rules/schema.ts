// Host-rules shapes. Browser-safe: no node:, no reactor root.
import type { HostExport } from "@powerhousedao/host-core/schema";
import { z } from "zod";

export const HOST_RULES_LIMITS = {
  setterValueBytes: 8_192,
  pathSegments: 32,
} as const;

export const deleteMarkerSchema = z.strictObject({ $delete: z.literal(true) });

const DELETE_KEY = "$delete";

function hasDeleteKey(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.hasOwn(value, DELETE_KEY)
  );
}

/** `{$delete: true}` removes the key; any other `$delete` object is refused. */
export const setterSchema = z.strictObject({
  path: z.string().min(1).max(512),
  value: z.union([
    deleteMarkerSchema,
    z.json().refine((value) => !hasDeleteKey(value), {
      message: "$delete must be exactly { $delete: true }",
    }),
  ]),
});
export type Setter = z.infer<typeof setterSchema>;

export function isDelete(value: Setter["value"]): value is { $delete: true } {
  return (
    hasDeleteKey(value) &&
    Object.keys(value as object).length === 1 &&
    (value as Record<string, unknown>).$delete === true
  );
}

/** What the monitor can offer the host it builds. */
export const hostRulesContextSchema = z.object({
  /** The controller has a Postgres server to hand out (PH_MONITOR_PG_URL). */
  postgres: z.boolean(),
  /** A controller is mounted, so switchboards can be started. */
  controller: z.boolean(),
  /** Where switchboards read signer credentials (reactor-api default: remote). */
  renownSource: z.enum(["self", "remote"]).default("remote"),
  /** The verb the host runs with; else its defaultVerb, else run. */
  verb: z.string().min(1).optional(),
});
export type HostRulesContext = z.input<typeof hostRulesContextSchema>;

/** The host's environment: its reactors run in one process and all read it. A
 * key set here wins over each switchboard's own settings. */
export type HostEnv = Record<string, string>;

export type HostDraft = { envelope: HostExport; env?: HostEnv };

export const RULES = [
  "setter",
  "env",
  "shape",
  "protocol",
  "ladder",
  "storage",
  "port",
  "config",
  "postgres",
  "capability",
  "workers",
  "scope",
] as const;
export type RuleName = (typeof RULES)[number];

/** `path` is an envelope path, or `env.<KEY>` for a key of the host's env. */
export type HostRuleIssue = {
  rule: RuleName;
  path: string;
  message: string;
  file?: string;
  /** Technical detail for a secondary line. */
  hint?: string;
};
