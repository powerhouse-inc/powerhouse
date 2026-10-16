// Renders the app shell at `/` before the reactor is up; `pnpm build` writes it to dist/shell.html.
import { createPHStore, PHStoreProvider } from "@powerhousedao/reactor-browser";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { prerender } from "react-dom/static";
import { loadRuntimeConfig } from "../runtime-config.js";
import { ShellLoader } from "./shell-loader.js";

// The config file is read at runtime; the shell renders Connect's defaults.
// The loader fetches only in a browser, so one is stood in for the read.
async function loadDefaultConfig() {
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
}

export async function renderShell(): Promise<string> {
  await loadDefaultConfig();
  // After the config: these modules read it as they evaluate.
  const [{ connectRouteComponents }, { RouterChrome }, routerModule] =
    await Promise.all([
      import("../components/router.js"),
      import("../components/route-views.js"),
      import("../router/connect-router.js"),
    ]);
  // No reactor and no drives, as the app is until the reactor is up.
  const store = createPHStore();
  const connectRouter = routerModule.createConnectRouter({
    store,
    components: connectRouteComponents,
    history: createMemoryHistory({ initialEntries: ["/"] }),
    InnerWrap: RouterChrome,
  });
  routerModule.bindConnectRouter(connectRouter, store);
  await connectRouter.router.load();

  const errors: unknown[] = [];
  const { prelude } = await prerender(
    <PHStoreProvider store={store}>
      <RouterProvider router={connectRouter.router} />
      <ShellLoader />
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
