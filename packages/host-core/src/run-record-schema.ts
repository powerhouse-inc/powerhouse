import { z } from "zod";
import {
  hostNameSchema,
  PACKAGE_NAME_PATTERN,
  runnerKindSchema,
} from "./host-schemas.js";

/**
 * `.ph/run/<host>.json`, version 2 (typed-host-configs 3.6): what a running
 * host and its members produced. Validated on read; a v1 (or any invalid)
 * record reads as "not running". `projectName` is kept beyond the plan's
 * sketch because the live/foreign probe needs it. `host` is the host's
 * `name` (the file key), not its folder. A host an installed package
 * supplies has its record in a folder named after the package,
 * `.ph/run/<package>/<host>.json`, and says which in `package`.
 */

const outputsSchema = z.record(z.string(), z.unknown());

export const runRecordMemberSchema = z.strictObject({
  /** The member's host as the project addresses it: its folder, or
   * `<package>/<host>` for one a package supplies. */
  host: z.string().min(1),
  runnerModule: z.string().min(1),
  kind: runnerKindSchema,
  verb: z.string().min(1),
  outputs: outputsSchema,
});

export const runRecordSchema = z.strictObject({
  version: z.literal(2),
  host: hostNameSchema,
  /** The installed package that supplies the host; absent for the
   * project's own. */
  package: z.string().regex(PACKAGE_NAME_PATTERN).optional(),
  projectName: z.string(),
  kind: runnerKindSchema,
  verb: z.string().min(1),
  pid: z.number().int(),
  startedAt: z.string(),
  /** Standalone hosts: the runner's outputs. */
  outputs: outputsSchema.optional(),
  /** Compounds: one entry per started member, keyed by member name. */
  members: z.record(z.string(), runRecordMemberSchema).optional(),
  /** Host-specific extras (e.g. mcpUrl) a runner wants in the record. */
  extra: z.record(z.string(), z.unknown()).optional(),
});

export type RunRecord = z.infer<typeof runRecordSchema>;
export type RunRecordMember = z.infer<typeof runRecordMemberSchema>;
