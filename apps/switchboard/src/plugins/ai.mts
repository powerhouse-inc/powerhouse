import type { HostPlugin } from "@powerhousedao/host-core";
import { AuthorizationPolicy, type API } from "@powerhousedao/reactor-api";
import type { ILogger } from "document-model";
import { z } from "zod";
import { registerAiRoutes } from "../ai/routes.mjs";
import type { SwitchboardHostContext } from "../plugin-host.mjs";
import type { ComposedWorkflowRuntime } from "../workflow-runtime.mjs";

export const DEFAULT_AI_UPSTREAM_URL = "https://openrouter.ai/api/v1";

export const aiPluginConfigSchema = z.strictObject({
  /** The model the gateway answers with until an admin picks another. */
  defaultModel: z.string().min(1),
  /** Upper bound on `max_tokens` per request. */
  maxOutputTokens: z.number().int().positive().default(4096),
  /** The OpenAI-compatible provider. Tests point this at a stub. */
  upstreamUrl: z.url().default(DEFAULT_AI_UPSTREAM_URL),
  /** How the host names itself to the provider (OpenRouter's app attribution). */
  appTitle: z.string().min(1).default("Powerhouse"),
  appUrl: z.url().default("https://powerhouse.inc"),
  /**
   * Local development only. Under the OPEN policy everyone is an admin,
   * anonymous callers included, so the gateway does not mount there unless
   * this says so.
   */
  allowWithoutAuth: z.boolean().default(false),
});

export type AiPluginConfig = z.infer<typeof aiPluginConfigSchema>;

/** What a host.js entry writes (typed-host-configs 1.4). */
export type AiPluginConfigInput = z.input<typeof aiPluginConfigSchema>;

declare global {
  interface PHPluginConfigs {
    "@powerhousedao/switchboard/plugins/ai": AiPluginConfigInput;
  }
}

export type AiPlugin = HostPlugin<
  { onHttpMounting: (ctx: SwitchboardHostContext) => void },
  AiPluginConfig
>;

/**
 * The AI gateway: an OpenAI-compatible endpoint for this host's admins that
 * holds the provider key server side, so the browser's agent runs without
 * one. The key is a host secret in the workflow runtime's encrypted store,
 * reached per request through `ctx.workflows`: the runtime can arrive after
 * boot, and a second opener of the store could race the first over the key
 * file. Without the runtime the routes answer 503.
 */
export function createAiPlugin(rawConfig: unknown): AiPlugin {
  const config = aiPluginConfigSchema.parse(rawConfig ?? {});
  return {
    name: "switchboard-ai",
    appliesTo: "switchboard",
    configSchema: aiPluginConfigSchema,
    hooks: {
      onHttpMounting: (ctx) => {
        const api = ctx.api as API;
        const logger = ctx.logger as ILogger;
        const { authorizationService } = api;
        // A warning, not a refused boot: a host composition is shared by
        // stacks that run with and without sign-in (desktop has none).
        if (
          authorizationService.config.policy === AuthorizationPolicy.OPEN &&
          !config.allowWithoutAuth
        ) {
          logger.warn(
            "The AI gateway is not mounted: this host has no sign-in, so every caller would be an admin. Enable authentication (AUTH_ENABLED=true with ADMINS), or set allowWithoutAuth for local development.",
          );
          return;
        }
        registerAiRoutes(
          api.httpRoutes.scopeFor("@powerhousedao/switchboard"),
          {
            isAdmin: (address) => authorizationService.isSupremeAdmin(address),
            secrets: async () =>
              (ctx.workflows as ComposedWorkflowRuntime | undefined)?.secrets(),
            upstreamUrl: config.upstreamUrl.replace(/\/+$/, ""),
            defaultModel: config.defaultModel,
            maxOutputTokens: config.maxOutputTokens,
            appTitle: config.appTitle,
            appUrl: config.appUrl,
            logger,
          },
        );
      },
    },
  };
}

// resolveHostPlugins consumes the DEFAULT export (plugin object or factory).
export default createAiPlugin;
