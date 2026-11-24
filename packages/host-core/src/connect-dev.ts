import type { HostPlugin, Provide } from "./plugins.js";

/** What the tool that started a dev server knows of the run. */
export interface ConnectDevRun {
  /** The tool that runs the dev server, for example the `ph` CLI. */
  tool: { name: string; version: string };
  /** When the run came up, as an ISO timestamp. Null when the tool does not
   * know. */
  startedAt: string | null;
  /** Where the run's other services answer: a URL by service name, for
   * example `switchboard`. A service the run does not have is left out. */
  services: Readonly<Record<string, string>>;
}

/** What the dev server of a Connect host hands a plugin's `devServer` hook. */
export interface ConnectDevServerContext {
  /** The folder of the project the dev server runs. */
  projectRoot: string;
  /** Read at each call: the services of a run come up after its dev server. */
  run: () => ConnectDevRun;
}

/**
 * The hooks of a Connect dev-server plugin, which a host lists in
 * `runner.devPlugins`. Only a dev server loads these plugins, so nothing they
 * add reaches a build or a production server.
 *
 * `TVitePlugin` is Vite's `PluginOption`: host-core does not depend on Vite.
 */
export interface ConnectDevHooks<TVitePlugin = unknown> {
  /** Vite plugins for the dev server: its middleware, the tags it puts in
   * the page and the modules it serves the page. */
  devServer: Provide<readonly TVitePlugin[], ConnectDevServerContext>;
}

export type ConnectDevPlugin<TVitePlugin = unknown> = HostPlugin<
  ConnectDevHooks<TVitePlugin>
>;
