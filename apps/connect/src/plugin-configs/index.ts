/**
 * `@powerhousedao/connect/plugin-configs`: the entry config schemas of every
 * built-in Connect plugin, and their `PHPluginConfigs` augmentations, without
 * the plugins themselves. Zod-only and browser-neutral (no React, no DOM, no
 * `node:`), so a Node process (`ph run`) can validate a host's composition
 * and host.js typing can reference the augmentations. The plugins in
 * `src/plugins/` import their schemas from these same modules.
 */
import { assistantConfigSchema } from "./assistant.js";
import { genericConfigSchema } from "./generic.js";
import { openPanelConfigSchema } from "./openpanel.js";
import { sentryConfigSchema } from "./sentry.js";
import { vetraStudioConfigSchema } from "./vetra-studio.js";
import { workflowsConnectConfigSchema } from "./workflows.js";

export {
  assistantConfigSchema,
  type AssistantConfigInput,
} from "./assistant.js";
export {
  genericConfigSchema,
  type GenericConfig,
  type GenericConfigInput,
} from "./generic.js";
export {
  openPanelConfigSchema,
  type OpenPanelConfigInput,
} from "./openpanel.js";
export { sentryConfigSchema, type SentryConfigInput } from "./sentry.js";
export {
  vetraStudioConfigSchema,
  type VetraStudioConfigInput,
} from "./vetra-studio.js";
export {
  workflowsConnectConfigSchema,
  type WorkflowsConnectConfig,
  type WorkflowsConnectConfigInput,
} from "./workflows.js";

/** Every built-in Connect plugin's entry config schema, by specifier. */
export const connectPluginConfigSchemas = {
  "@powerhousedao/connect/plugins/assistant": assistantConfigSchema,
  "@powerhousedao/connect/plugins/generic": genericConfigSchema,
  "@powerhousedao/connect/plugins/openpanel": openPanelConfigSchema,
  "@powerhousedao/connect/plugins/sentry": sentryConfigSchema,
  "@powerhousedao/vetra-studio/connect": vetraStudioConfigSchema,
  "@powerhousedao/connect/plugins/workflows": workflowsConnectConfigSchema,
} as const;
