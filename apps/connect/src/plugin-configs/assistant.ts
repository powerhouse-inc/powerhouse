import { z } from "zod";

/** `@powerhousedao/connect/plugins/assistant` takes no entry config: presence
 * is the `ai.assistantEnabled` switch. */
export const assistantConfigSchema = z.strictObject({});

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type AssistantConfigInput = z.input<typeof assistantConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/assistant": AssistantConfigInput;
  }
}
