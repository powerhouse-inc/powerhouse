import type { HostPlugin } from "@powerhousedao/host-core";
import type { API, ISubgraph } from "@powerhousedao/reactor-api";
import { NodeKeyStorage } from "@renown/sdk/node";
import {
  createStudioSubgraph,
  type JwkPair,
  type StudioRenown,
} from "./sign-in.js";

/**
 * Vetra Studio, server side (rewire R4): what makes a switchboard the STUDIO
 * switchboard and cannot be expressed through other plugins — the dev-mode
 * machinery (Vite-loaded local document models with HMR), and studio sign-in
 * (an admin's bearer gets the studio's Renown identity, so an agent can log
 * the studio Connect in; see sign-in.ts). Listed verb-scoped (verbs: ["dev"])
 * in the vetra host; `ph run vetra` at the run verb is the same stack
 * headless, without dev tooling. The studio DRIVES are not this plugin's
 * business: they are core drive declarations in the host file
 * (reactor.drives with projectHash ids), seeded by the runner.
 *
 * Codegen hot-reload stays a runner/dev-verb concern (the project-level
 * watcher), tracked as the R4 follow-up alongside external browser plugin
 * loading.
 */

export interface StudioHostContext {
  options?: Record<string, unknown>;
  renown?: unknown;
  api?: unknown;
  graphqlManager?: unknown;
  lateSubgraphs?: Promise<unknown>[];
}

interface SubgraphRegistry {
  registerSubgraphInstance(
    subgraph: ISubgraph,
    supergraph?: string,
    core?: boolean,
  ): Promise<unknown>;
}

export interface StudioHooks {
  transformServerOptions: (
    options: Record<string, unknown>,
  ) => Record<string, unknown>;
  onSubgraphsRegistering: (ctx: StudioHostContext) => Promise<void>;
}

/** The key pair the switchboard signs with: the same file and env var its
 * identity loads from (`options.identity.keypairPath`, else .ph/.keypair.json). */
export function hostKeyPairLoader(
  options: Record<string, unknown> | undefined,
): () => Promise<JwkPair | undefined> {
  const identity = options?.identity as { keypairPath?: string } | undefined;
  return async () =>
    (await new NodeKeyStorage(identity?.keypairPath).loadKeyPair()) as
      | JwkPair
      | undefined;
}

export function createStudioSwitchboardPlugin(
  loadKeyPairFor: (
    options: Record<string, unknown> | undefined,
  ) => () => Promise<JwkPair | undefined> = hostKeyPairLoader,
): HostPlugin<StudioHooks> {
  return {
    name: "vetra-studio-switchboard",
    appliesTo: "switchboard",
    hooks: {
      transformServerOptions: (options) => ({ ...options, dev: true }),
      onSubgraphsRegistering: async (ctx) => {
        const api = ctx.api as
          | (Pick<API, "authorizationService" | "relationalDb"> & {
              authService: unknown;
            })
          | undefined;
        const registry = ctx.graphqlManager as SubgraphRegistry | undefined;
        if (!api || !registry) {
          throw new Error(
            "The vetra-studio plugin needs the switchboard's API and GraphQL manager at onSubgraphsRegistering; the host handed neither.",
          );
        }
        const registration = registry.registerSubgraphInstance(
          createStudioSubgraph({
            api,
            relationalDb: api.relationalDb,
            renown: ctx.renown as StudioRenown | null | undefined,
            loadKeyPair: loadKeyPairFor(ctx.options),
          }),
          "graphql",
          false,
        );
        (ctx.lateSubgraphs ??= []).push(registration);
        await Promise.resolve();
      },
    },
  };
}

const studioSwitchboardPlugin: HostPlugin<StudioHooks> =
  createStudioSwitchboardPlugin();

export default studioSwitchboardPlugin;
