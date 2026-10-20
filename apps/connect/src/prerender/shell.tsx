// Renders the app shell at `/` before the reactor is up; `pnpm build` writes it to dist/shell.html.
import { createPHStore, PHStoreProvider } from "@powerhousedao/reactor-browser";
import type { AnyRoute } from "@tanstack/react-router";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { prerender } from "react-dom/static";
import {
  getRuntimeConfig,
  primeRuntimeConfig,
} from "@powerhousedao/connect-core/runtime-config";
import { loadRuntimeConfig } from "../load-runtime-config.js";
import type { AppShellKind } from "./app-shell.js";
import { APP_NAME_TOKEN, appShell, shellMarkup } from "./app-shell.js";
import { shellCss } from "./shell-css.js";
import { CoreShellLoader, ShellLoader } from "./shell-loader.js";

export { appShell, shellCss, shellMarkup };
export type { AppShellKind };

// The config file is read at runtime; the shell renders Connect's defaults.
// The loader fetches only in a browser, so one is stood in for the read.
async function loadDefaultConfig(variant: ShellVariant) {
  const global = globalThis as { window?: unknown };
  const fetch = globalThis.fetch;
  global.window = globalThis;
  globalThis.fetch = (() =>
    Promise.resolve(Response.json({}))) as unknown as typeof fetch;
  try {
    await loadRuntimeConfig();
  } finally {
    globalThis.fetch = fetch;
    delete global.window;
  }
  // Core's shell is the one for a composition without the generic plugin.
  const config = getRuntimeConfig();
  primeRuntimeConfig({
    ...config,
    connect: {
      ...config.connect,
      composition: variant === "core" ? [] : undefined,
    },
  });
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
  const connectRouter = routerModule.createConnectRouter({
    routeTree,
    store,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    InnerWrap: RouterChrome,
    // The project's name is only known at its build; scripts/prerender-shell.ts marks this.
    appName: APP_NAME_TOKEN,
    // A project's layout shows its pendingComponent in place of the page.
    shell: kind === "project",
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
