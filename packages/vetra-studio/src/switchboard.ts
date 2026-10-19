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
 * Codegen hot-reload stays a runner/dev-verb concern (the project-level
 * watcher), tracked as the R4 follow-up alongside external browser plugin
 * loading.
 */
const studioSwitchboardPlugin: HostPlugin<{
  transformServerOptions: (
    options: Record<string, unknown>,
  ) => Record<string, unknown>;
}> = {
  name: "vetra-studio-switchboard",
  appliesTo: "switchboard",
  hooks: {
    transformServerOptions: (options) => ({ ...options, dev: true }),
  },
};

export default studioSwitchboardPlugin;
