import type { HostPlugin } from "@powerhousedao/host-core";

/**
 * Vetra Studio, server side (rewire R4): what makes a switchboard the STUDIO
 * switchboard and cannot be expressed through other plugins — the dev-mode
 * machinery (Vite-loaded local document models with HMR). Listed verb-scoped
 * (verbs: ["dev"]) in the vetra host; `ph run vetra` at the run verb is the
 * same stack headless, without dev tooling. The studio DRIVES are not this
 * plugin's business: they are core drive declarations in the host file
 * (reactor.drives with projectHash ids), seeded by the runner.
 *
 * The Studio's tab signs in by link (F3d): the Connect server's loopback
 * endpoint issues its credential as the person's own identity, so the
 * switchboard hands no login over.
 *
 * Codegen hot-reload stays a runner/dev-verb concern (the project-level
 * watcher), tracked as the R4 follow-up alongside external browser plugin
 * loading.
 *
 * The codegen PROCESSOR comes with `@powerhousedao/vetra`, when the host lists
 * that package (`config.switchboard.packages.list`); its config
 * (`VetraConfig`: which drive it generates from, `--interactive`) reaches it
 * through this plugin's entry config, which the ph-cli switchboard runner
 * fills in from the invocation.
 */

/** The entry config. Not for host files: the runner writes it. */
export interface StudioSwitchboardConfig {
  /** Entries for the server's `processorConfig` map, by processor config key
   * (classic `ph vetra` passes the same map to the same server option). */
  processorConfig?: Record<string, unknown>;
}

export interface StudioHooks {
  transformServerOptions: (
    options: Record<string, unknown>,
  ) => Record<string, unknown>;
}

export function createStudioSwitchboardPlugin(
  config: StudioSwitchboardConfig = {},
): HostPlugin<StudioHooks> {
  const processorConfig = Object.entries(config.processorConfig ?? {});
  return {
    name: "vetra-studio-switchboard",
    appliesTo: "switchboard",
    hooks: {
      transformServerOptions: (options) => {
        const transformed = { ...options, dev: true };
        if (processorConfig.length === 0) return transformed;
        const existing =
          options.processorConfig instanceof Map
            ? (options.processorConfig as Map<string, unknown>)
            : [];
        return {
          ...transformed,
          processorConfig: new Map([...existing, ...processorConfig]),
        };
      },
    },
  };
}

/** A factory, so the entry may carry config (host-core plugins-resolve). */
const studioSwitchboardPlugin = (
  config?: StudioSwitchboardConfig,
): HostPlugin<StudioHooks> => createStudioSwitchboardPlugin(config);

export default studioSwitchboardPlugin;
