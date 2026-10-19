import { ref } from "@powerhousedao/host-core/schema";
import { z } from "zod";

/** The token form that replaced `{ from, slug }` drive references. */
const DRIVE_TOKEN_HINT =
  'use switchboard.drives.workflows.url from ../switchboard/outputs.js, or { $output: { host: "switchboard", path: ["drives", "workflows", "url"] } }';

/** `{ from, slug }`: the compound drive reference output tokens replaced.
 * (A schema, not an `in` check: the import-allowlist scans read a quoted
 * `from` as an import specifier.) */
const removedDriveReferenceSchema = z.looseObject({
  from: z.string(),
  slug: z.string(),
});

/** `drive` as `ref(z.url())`, with the removed `{ from, slug }` form named
 * in its error instead of zod's generic union message. */
const driveSchema = z.union(ref(z.url()).options, {
  error: (issue) =>
    removedDriveReferenceSchema.safeParse(issue.input).success
      ? `drive: { from, slug } was removed; ${DRIVE_TOKEN_HINT}`
      : undefined,
});

/** The `@powerhousedao/connect/plugins/workflows` entry config. `drive` is
 * the switchboard's Workflows drive URL; a host file usually writes it as an
 * output token, which `ph run` resolves before the config reaches the
 * browser. */
export const workflowsConnectConfigSchema = z.strictObject({
  drive: driveSchema.optional(),
  /** Display name for the attached drive entry (the drive's own name wins
   * once it syncs). */
  name: z.string().min(1).optional(),
});

export type WorkflowsConnectConfig = z.infer<
  typeof workflowsConnectConfigSchema
>;

/** What a host.js entry writes: `drive` is a URL or an output token. A type
 * alias, not an interface, so it stays assignable to the runtime
 * `PluginEntryData` config record. */
export type WorkflowsConnectConfigInput = z.input<
  typeof workflowsConnectConfigSchema
>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/workflows": WorkflowsConnectConfigInput;
  }
}
