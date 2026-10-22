import { connectSentrySchema } from "@powerhousedao/shared/connect/connect-config-schema";
import type { z } from "zod";

/** The `@powerhousedao/connect/plugins/sentry` entry config IS the
 * `connect.sentry` slice, typed and validated by that slice's single-source
 * schema (a typo'd key fails). */
export const sentryConfigSchema = connectSentrySchema;

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type SentryConfigInput = z.input<typeof sentryConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/sentry": SentryConfigInput;
  }
}
