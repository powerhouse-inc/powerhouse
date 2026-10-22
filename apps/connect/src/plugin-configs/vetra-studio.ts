import { z } from "zod";

/** `@powerhousedao/vetra-studio/connect` takes no entry config: presence is
 * the studio-mode switch. */
export const vetraStudioConfigSchema = z.strictObject({});

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type VetraStudioConfigInput = z.input<typeof vetraStudioConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/vetra-studio/connect": VetraStudioConfigInput;
  }
}
