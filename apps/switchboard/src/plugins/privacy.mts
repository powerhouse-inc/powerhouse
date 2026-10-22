import type { IRenown } from "@renown/sdk";
import type { HostPlugin } from "@powerhousedao/host-core";
import type { ILogger } from "document-model";
import {
  resolvePrivacy,
  startPrivacy,
  type PrivacyOptions,
  type ResolvedPrivacy,
  type RunningPrivacy,
} from "../privacy.mjs";
import type { SwitchboardHostContext } from "../plugin-host.mjs";
import { z } from "zod";

/** No entry config: presence is the whole activation. A typo'd config key
 * fails at resolution instead of being silently ignored. */
export const privacyPluginConfigSchema = z.strictObject({});

export type PrivacyPluginConfig = z.input<typeof privacyPluginConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/switchboard/plugins/privacy": PrivacyPluginConfig;
  }
}

/**
 * R2.4 — the privacy subsystem as a built-in plugin. Presence is activation
 * of the SUBSYSTEM; whether privacy enforcement runs still requires its
 * config (enabled + deploymentSecret — A SECRET, env-only:
 * PH_PRIVACY_DEPLOYMENT_SECRET never enters host files).
 *
 * Timing preserved from the inline path (carve map): config resolves EARLY at
 * transformServerOptions (a bad secret fails the boot before any resource
 * opens — same fail-fast property as the inline line-571 resolve); the mount
 * runs at onSubgraphsRegistering, whose server-side call site carries the
 * inline failure semantics (stop workflows, abortBoot, rethrow); teardown is
 * first in shutdown via onShutdown.
 */

type PrivacyCapableOptions = Record<string, unknown> & {
  privacy?: PrivacyOptions & { signer?: unknown };
  reactor?: unknown;
};

export const privacyPlugin: HostPlugin<{
  transformServerOptions: (
    options: Record<string, unknown>,
    ctx: SwitchboardHostContext,
  ) => Record<string, unknown>;
  onSubgraphsRegistering: (ctx: SwitchboardHostContext) => Promise<void>;
  onShutdown: (ctx: SwitchboardHostContext) => Promise<void>;
}> = {
  name: "switchboard-privacy",
  appliesTo: "switchboard",
  configSchema: privacyPluginConfigSchema,
  hooks: {
    transformServerOptions: (options, ctx) => {
      // Fail-fast resolve, before the reactor is built.
      ctx.privacyConfig = resolvePrivacy(
        (options as PrivacyCapableOptions).privacy,
        process.env,
      );
      return options;
    },
    onSubgraphsRegistering: async (ctx) => {
      const config = ctx.privacyConfig as ResolvedPrivacy;
      if (!config.enabled) return;
      const options = ctx.options as PrivacyCapableOptions;
      // The caller's reactor signs with a signer only the caller knows.
      const signer = options.reactor
        ? options.privacy?.signer
        : (options.privacy?.signer ?? (ctx.renown as IRenown | null)?.signer);
      const api = ctx.api as {
        authorizationService: never;
        documentPermissionService: never;
      };
      ctx.privacy = await startPrivacy({
        config,
        reactorModule: (
          ctx.reactorClientModule as { reactorModule?: never } | undefined
        )?.reactorModule,
        signer: signer as never,
        authorizationService: api.authorizationService,
        documentPermissionService: api.documentPermissionService,
        graphqlManager: ctx.graphqlManager as never,
        reactorClient: ctx.client as never,
        logger: (ctx.logger as ILogger).child(["privacy"]),
      });
    },
    onShutdown: async (ctx) => {
      await (ctx.privacy as RunningPrivacy | undefined)?.stop();
    },
  },
};

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default privacyPlugin;
