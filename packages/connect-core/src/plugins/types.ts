import type { HostPlugin } from "@powerhousedao/host-core/plugins";
import type { PHConnectRuntimeConfig } from "@powerhousedao/shared/clis";
import type {
  ErrorRouteComponent,
  NotFoundRouteComponent,
  RouteComponent,
  StaticDataRouteOption,
} from "@tanstack/react-router";
import type { ComponentType } from "react";
import type { ConnectRouteRegistration } from "../registry.js";
import type { ConnectModals } from "../router/modals.js";

/**
 * The hook vocabulary ConnectCore exposes to its built-in plugins (rewire R3).
 * `transformConnectConfig` is the one lifecycle moment wired today: each
 * plugin rewrites the config slice it owns, before the runtime cache warms.
 * `onShutdown` keeps teardown parity with the server pipeline. Deeper moments
 * (onStoreReady, onReactorReady) are added as the browser pipeline grows.
 */
export interface ConnectPluginContext {
  /** The entry's own config, re-exposed on the context for observe hooks. */
  entryConfig: Record<string, unknown>;
}

export interface ConnectConfigHooks {
  transformConnectConfig: (
    config: PHConnectRuntimeConfig,
    ctx: ConnectPluginContext,
  ) => PHConnectRuntimeConfig;
  onShutdown: (ctx: ConnectPluginContext) => void | Promise<void>;
}

export type ConnectPlugin = HostPlugin<ConnectConfigHooks>;

/** A built-in Connect plugin module default-exports this: a factory over the
 * entry's config, matching host-core's `(config) => HostPlugin` contract. */
export type ConnectPluginFactory = (
  config: Record<string, unknown>,
) => ConnectPlugin;

/** Options a plugin sets on one of the tree's routes; `staticData` merges over the route's. */
export type ConnectRouteUi = {
  component?: RouteComponent;
  pendingComponent?: RouteComponent;
  errorComponent?: ErrorRouteComponent;
  notFoundComponent?: NotFoundRouteComponent;
  staticData?: Partial<StaticDataRouteOption>;
};

/** What an active plugin shows. */
export type ConnectPluginUi = {
  /** By route id, e.g. `/_app/`; applied only while the route shows core's view,
   * so a project's own route file wins. */
  routes?: Record<string, ConnectRouteUi>;
  /** Code routes the plugin adds, e.g. settings tabs. */
  addRoutes?: ConnectRouteRegistration;
  /** Modal views by type, over core's. */
  modals?: ConnectModals;
  /** Rendered once beside the app, e.g. a consent banner. */
  Root?: ComponentType;
  /** Any route's loader or render error. */
  errorComponent?: ErrorRouteComponent;
  /** Keeps common's editors (the drive explorer and model editors), which core leaves out. */
  commonEditors?: boolean;
  /** Needs the viewer's consent to analytics cookies, which the host asks for once. */
  consent?: boolean;
};

/** A plugin module the host knows by specifier; `whenAbsent` zeroes the
 * config slice it owns when a composition leaves it out. */
export type ConnectPluginDefinition = {
  create: ConnectPluginFactory;
  whenAbsent?: (config: PHConnectRuntimeConfig) => PHConnectRuntimeConfig;
  /** The plugin's UI, loaded only while it is active. */
  ui?: () => Promise<ConnectPluginUi>;
  /** The prerendered loading shell that shows this plugin's UI. */
  shell?: string;
};
