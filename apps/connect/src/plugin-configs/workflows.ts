import { driveReferenceSchema } from "@powerhousedao/host-core/plugins";
import { z } from "zod";

/** The `@powerhousedao/connect/plugins/workflows` entry config. `drive` is the
 * switchboard's drive URL or, inside a compound, a `{ from, slug }` reference
 * the compound substitutes before the config reaches the browser. */
export const workflowsConnectConfigSchema = z.strictObject({
  drive: z.union([z.string().min(1), driveReferenceSchema]).optional(),
  /** Display name for the attached drive entry (the drive's own name wins
   * once it syncs). */
  name: z.string().min(1).optional(),
});

export type WorkflowsConnectConfig = z.infer<
  typeof workflowsConnectConfigSchema
>;

/** What a host.js entry writes: `drive` is a URL or, inside a compound, a
 * `{ from, slug }` reference (output tokens replace the latter in T3). A
 * type alias, not an interface, so it stays assignable to the runtime
 * `PluginEntryData` config record. */
export type WorkflowsConnectConfigInput = z.input<
  typeof workflowsConnectConfigSchema
>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/workflows": WorkflowsConnectConfigInput;
  }
}
