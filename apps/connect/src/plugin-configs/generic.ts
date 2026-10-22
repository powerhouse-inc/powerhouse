import {
  connectDriveSectionsSchema,
  connectDrivesSchema,
  connectHomeSchema,
} from "@powerhousedao/shared/connect/connect-config-schema";
import { z } from "zod";

// The `@powerhousedao/connect/plugins/generic` entry config is the owned
// slices themselves, typed by the single-source Connect config schemas
// (typed-host-configs 1.6): `allowAddDrive`, `sections` and `icons` are
// `connect.drives.*`, `homeBackground` is `connect.home.background`. Strict,
// so a typo'd key fails instead of being ignored. The build's image
// resolution keeps the shape, so the same schema holds before and after it.
export const genericConfigSchema = z.strictObject({
  allowAddDrive: connectDrivesSchema.shape.allowAddDrive,
  sections: connectDriveSectionsSchema.optional(),
  icons: connectDrivesSchema.shape.icons,
  homeBackground: connectHomeSchema.shape.background,
});

export type GenericConfig = z.output<typeof genericConfigSchema>;

/** What a host.js entry writes. A type alias, not an interface, so it stays
 * assignable to the runtime `PluginEntryData` config record. */
export type GenericConfigInput = z.input<typeof genericConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/connect/plugins/generic": GenericConfigInput;
  }
}
