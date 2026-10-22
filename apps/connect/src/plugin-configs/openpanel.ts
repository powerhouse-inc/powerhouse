import { connectOpenPanelSchema } from "@powerhousedao/shared/connect/connect-config-schema";
import type { z } from "zod";

/** The `@powerhousedao/connect/plugins/openpanel` entry config IS the
 * `connect.openPanel` slice, typed and validated by that slice's
 * single-source schema (a typo'd key fails). */
export const openPanelConfigSchema = connectOpenPanelSchema;

/** What a host.js entry writes (a type alias, so it stays assignable to the
 * runtime `PluginEntryData` config record). */
export type OpenPanelConfigInput = z.input<typeof openPanelConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/openpanel": OpenPanelConfigInput;
  }
}
