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
        relationalDb: never;
        syncManager: never;
        attachmentClientProvider: never;
      };
      const graphqlManager = ctx.graphqlManager as {
        scopeForPackage(packageName: string): never;
      };
      ctx.privacy = await startPrivacy({
        config,
        reactorModule: (
          ctx.reactorClientModule as { reactorModule?: never } | undefined
        )?.reactorModule,
        signer: signer as never,
        subgraphArgs: {
          authorizationService: api.authorizationService,
          documentPermissionService: api.documentPermissionService,
          graphqlManager: graphqlManager as never,
          reactorClient: ctx.client as never,
          relationalDb: api.relationalDb,
          analyticsStore: undefined as never,
          syncManager: api.syncManager,
          http: graphqlManager.scopeForPackage(
            "@powerhousedao/reactor-privacy",
          ),
          attachments: api.attachmentClientProvider,
        },
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
