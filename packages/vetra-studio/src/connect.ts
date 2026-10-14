import type { HostPlugin } from "@powerhousedao/host-core";

/**
 * Vetra Studio, browser side (rewire R4). The Connect pipeline currently
 * resolves built-ins by specifier from its own registry (external browser
 * plugin loading is the documented follow-up), so this module is the
 * SERVER-RESOLVABLE identity of the plugin — the browser behavior
 * (studio mode: vetra packages, document-model tooling) activates through
 * the registry entry for "@powerhousedao/vetra-studio/connect".
 */
const studioConnectPlugin: HostPlugin = {
  name: "vetra-studio-connect",
  appliesTo: "connect",
};

export default studioConnectPlugin;
