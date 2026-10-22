import { createRemoteAttachmentService } from "@powerhousedao/reactor-attachments";
import type { IRenown } from "@renown/sdk";
import type { HostPlugin } from "@powerhousedao/host-core";
import { registerAttachmentRoutes } from "../attachments/index.js";
import { deriveAttachmentServiceConfig } from "../server.mjs";
import type { SwitchboardHostContext } from "../plugin-host.mjs";
import { z } from "zod";

/** No entry config: presence is the whole activation. A typo'd config key
 * fails at resolution instead of being silently ignored. */
export const attachmentsPluginConfigSchema = z.strictObject({});

export type AttachmentsPluginConfig = z.input<
  typeof attachmentsPluginConfigSchema
>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/switchboard/plugins/attachments": AttachmentsPluginConfig;
  }
}

/**
 * R2.3 — the attachments subsystem as a built-in plugin: the six /attachments
 * routes mount at onHttpMounting and the remote attachment service is created
 * for the returned handle. Presence is activation — removed from the
 * composition, the routes and service do not exist. NOT yet carved: the
 * attachment-reference read model registered inside reactor construction
 * (carve map: server.mts initializeClient) — it follows with the
 * onReadModelsRegistering step in R2 step 2; until then it registers on both
 * paths (a dormant read model when the plugin is absent, harmless).
 *
 * Inputs (carve map): api (routes), options.attachmentServiceUrl /
 * PH_SWITCHBOARD_PUBLIC_URL / https + serverPort + renown (service config).
 */
export const attachmentsPlugin: HostPlugin<{
  onHttpMounting: (ctx: SwitchboardHostContext) => void;
}> = {
  name: "switchboard-attachments",
  appliesTo: "switchboard",
  configSchema: attachmentsPluginConfigSchema,
  hooks: {
    onHttpMounting: (ctx) => {
      registerAttachmentRoutes(
        ctx.api as Parameters<typeof registerAttachmentRoutes>[0],
      );
      ctx.attachmentService = createRemoteAttachmentService(
        deriveAttachmentServiceConfig(
          ctx.options as { attachmentServiceUrl?: string; https?: boolean },
          ctx.serverPort as number,
          ctx.renown as IRenown | null,
        ),
      );
    },
  },
};

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default attachmentsPlugin;
