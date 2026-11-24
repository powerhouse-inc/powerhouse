import type { ConnectPluginDefinition } from "@powerhousedao/connect-core/plugins";
import createAssistantPlugin from "./assistant.js";
import createGenericPlugin from "./generic.js";
import createOpenPanelPlugin from "./openpanel.js";
import createSentryPlugin from "./sentry.js";
import { GENERIC_PLUGIN } from "./ids.js";
import createVetraStudioPlugin from "./vetra-studio.js";
import createWorkflowsPlugin from "./workflows.js";

export { GENERIC_PLUGIN };

// Sentry and OpenPanel start only once the viewer accepts analytics cookies.
const ANALYTICS_CONSENT = { consent: true };

// Each built-in zeroes the config slice it owns when a composition leaves it out.
const driveSectionOff = { enabled: false, allowAdd: false, allowDelete: false };

/** Connect's built-in plugins, by the specifier a composition names. */
export const connectPlugins: Record<string, ConnectPluginDefinition> = {
  [GENERIC_PLUGIN]: {
    create: createGenericPlugin,
    ui: () => import("../generic/ui.js").then((m) => m.default),
    shell: "generic",
    // The drive-chrome toggles, explorer icons and home screen go: no
    // add-drive affordance, the sections off, built-in icons, no home
    // background. Branding is not zeroed: it is Connect-level and outlives
    // the plugin.
    whenAbsent: (config) => ({
      ...config,
      drives: {
        ...config.drives,
        allowAddDrive: false,
        sections: { remote: driveSectionOff, local: driveSectionOff },
        icons: null,
      } as never,
      home: { ...config.home, background: null } as never,
    }),
  },
  "@powerhousedao/connect/plugins/sentry": {
    create: createSentryPlugin,
    ui: () => Promise.resolve(ANALYTICS_CONSENT),
    whenAbsent: (config) => ({
      ...config,
      sentry: { ...config.sentry, dsn: null } as never,
    }),
  },
  "@powerhousedao/connect/plugins/openpanel": {
    create: createOpenPanelPlugin,
    ui: () => Promise.resolve(ANALYTICS_CONSENT),
    whenAbsent: (config) => ({
      ...config,
      openPanel: {
        ...config.openPanel,
        clientId: "",
        trackUiEvents: false,
        trackOperations: false,
      } as never,
    }),
  },
  "@powerhousedao/connect/plugins/assistant": {
    create: createAssistantPlugin,
    whenAbsent: (config) => ({
      ...config,
      ai: { ...config.ai, assistantEnabled: false } as never,
    }),
  },
  "@powerhousedao/connect/plugins/workflows": {
    create: createWorkflowsPlugin,
    // The workflow package (Workflow Studio) loads only when the plugin is
    // composed in; the classic workflows.enabled value is not the switch.
    whenAbsent: (config) => ({
      ...config,
      app: { ...config.app, workflowsEnabled: false } as never,
    }),
  },
  "@powerhousedao/vetra-studio/connect": {
    create: createVetraStudioPlugin,
    whenAbsent: (config) => ({
      ...config,
      app: { ...config.app, studioMode: false } as never,
    }),
  },
};
