// Renders the app shell at `/` before the reactor is up; `pnpm build` writes it to dist/shell.html.
import { createPHStore, PHStoreProvider } from "@powerhousedao/reactor-browser";
import type { AnyRoute } from "@tanstack/react-router";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { prerender } from "react-dom/static";
import {
  getConnectPluginUi,
  loadConnectPluginUi,
  registerConnectPlugins,
  resetConnectPluginUi,
} from "@powerhousedao/connect-core/plugins";
import { primeRuntimeConfig } from "@powerhousedao/connect-core/runtime-config";
import type { RuntimePowerhouseConfig } from "@powerhousedao/shared/connect";
import { DEFAULT_CONNECT_CONFIG } from "@powerhousedao/shared/connect";
import type { AppShellKind } from "./app-shell.js";
import { APP_NAME_TOKEN, appShell, shellMarkup } from "./app-shell.js";
import { shellCss } from "./shell-css.js";
import { CoreShellLoader, ShellLoader } from "./shell-loader.js";

export { appShell, shellCss, shellMarkup };
export type { AppShellKind };

async function loadDefaultConfig(variant: ShellVariant) {
  // The config file is read at runtime; the shell renders Connect's defaults.
  // Not through the config loader: its cache is the realm's, so a dev server's
  // next render would read the variant primed last.
  primeRuntimeConfig({
    connect: {
      ...DEFAULT_CONNECT_CONFIG,
      // Core's shell is the one for a composition without a plugin that has a shell.
      composition: variant === "core" ? [] : undefined,
    },
  } as RuntimePowerhouseConfig);
  registerConnectPlugins(connectPlugins);
  const plugin = (await shellPlugins())[variant];
  await loadConnectPluginUi(plugin ? [{ module: plugin }] : []);
}

const connectPlugins = () =>
  import("../plugins/index.js").then((m) => m.connectPlugins);

/** Each prerendered shell's plugin, whose presence in a composition picks it; core's has none. */
export async function shellPlugins(): Promise<
  Partial<Record<ShellVariant, string>>
> {
  return Object.fromEntries(
    Object.entries(await connectPlugins()).flatMap(([module, definition]) =>
      definition.shell ? [[definition.shell, module]] : [],
    ),
  );
}

/** `generic`: Connect's chrome. `core`: core's views, for a composition without the generic plugin. */
export type ShellVariant = "generic" | "core";

export { APP_NAME_TOKEN };

/** Renders the route tree at `/` before the reactor is up. `kind` picks the
 * loader: Connect's logo for its chrome, core's spinner otherwise. */
export async function renderShell(
  variant: ShellVariant = "generic",
  kind: AppShellKind = variant,
): Promise<string> {
  await loadDefaultConfig(variant);
  // After the config: these modules read it as they evaluate.
  const [{ routeTree }, { RouterChrome }, routerModule] = await Promise.all([
    import("@powerhousedao/connect/route-tree"),
    import("../components/route-views.js"),
    import("@powerhousedao/connect-core/router"),
  ]);
  // No reactor and no drives, as the app is until the reactor is up.
  const store = createPHStore();
  // A server router reuses the tree processed for the last variant; plugins' routes change it.
  delete (globalThis as { __TSR_CACHE__?: unknown }).__TSR_CACHE__;
  const connectRouter = routerModule.createConnectRouter({
    routeTree,
    store,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    InnerWrap: RouterChrome,
    // The project's name is only known at its build; scripts/prerender-shell.ts marks this.
    appName: APP_NAME_TOKEN,
    // A project's layout shows its pendingComponent in place of the page.
    shell: kind === "project",
    pluginUi: getConnectPluginUi(),
  });
  routerModule.bindConnectRouter(connectRouter, store);
  await connectRouter.router.load();
  // A project layout's own pending view is its loader; core's spinner without one.
  const { appRoute } = routerModule.connectRoutes(routeTree as AnyRoute);
  const layoutPending = appRoute.options.pendingComponent;
  const Loader =
    kind === "generic"
      ? ShellLoader
      : kind === "project" && layoutPending
        ? () => null
        : CoreShellLoader;

  const errors: unknown[] = [];
  const { prelude } = await prerender(
    <PHStoreProvider store={store}>
      <RouterProvider router={connectRouter.router} />
      <Loader />
    </PHStoreProvider>,
    {
      // Inline every boundary; outlined ones need React's runtime to reveal.
      progressiveChunkSize: Number.POSITIVE_INFINITY,
      onError: (error) => {
        errors.push(error);
      },
    },
  );
  // The next variant renders the tree with its own plugins' UI.
  resetConnectPluginUi(routeTree as AnyRoute);
  // A boundary that errored renders its fallback, which is not the shell.
  if (errors.length) {
    throw new AggregateError(errors, "The app shell failed to prerender");
  }
  return await new Response(prelude).text();
}

/** A project's shells, one per variant: its route tree rendered at `/`, with
 * CSS that `stylesheet`, its Tailwind entry, builds for the markup's classes. */
export async function renderProjectShells(stylesheet: string) {
  const shells: Partial<Record<ShellVariant, { body: string; head: string }>> =
    {};
  for (const variant of ["generic", "core"] as const) {
    const markup = shellMarkup(await renderShell(variant, "project"));
    const css = await shellCss(stylesheet, markup);
    shells[variant] = appShell("project", variant, markup, css);
  }
  return shells;
}
