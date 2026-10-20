import {
  initTheme,
  useLinkProps,
  useTheme,
} from "@powerhousedao/reactor-browser";
import { HeadContent, Link, Outlet, useRouter } from "@tanstack/react-router";
import { Suspense } from "react";
import type { ConnectModals } from "../router/modals.js";
import { CORE_MODAL_VIEWS, ModalOutlet } from "../router/modals.js";
import { ContentOutlet } from "../router/route-components.js";
import { useNavRoutes, useSidebarMode } from "../router/sidebar.js";
import { appTitle } from "../router/titles.js";
import { useIsEmbedded } from "../runtime/embedded.js";
import { ThemeToggle } from "./theme-toggle.js";
import { linkClass } from "./index-table.js";
import * as modalViews from "./modals.js";

// The layout shares the modals' chunk, so it renders them directly.
const coreModals: ConnectModals = Object.fromEntries(
  Object.entries(CORE_MODAL_VIEWS).map(([type, name]) => [
    type,
    modalViews[name],
  ]),
);

/** Core's root: the page, in the theme. */
export function CoreRoot() {
  initTheme();
  useTheme();
  return (
    <div className="h-screen overflow-auto bg-core-bg text-core-fg">
      {/* The matched routes' head: the document title. */}
      <HeadContent />
      <Suspense name="CoreRoot">
        <Outlet />
      </Suspense>
      <ModalOutlet modals={coreModals} />
    </div>
  );
}

/** Core's header: home, the `staticData.nav` routes, settings and the theme. */
export function CoreHeader() {
  const appName = useRouter().options.context.appName;
  const home = useLinkProps(undefined);
  const settings = useLinkProps({ settings: true });
  const navRoutes = useNavRoutes();
  return (
    <header className="flex items-center gap-4 border-b border-core-border px-4 py-2 text-sm">
      <a {...home} className="font-semibold text-core-fg">
        {appTitle(appName)}
      </a>
      <nav aria-label="Pages" className="flex gap-3">
        {navRoutes.map((item) => (
          // `to` is a plain string: the routes are only known at runtime.
          <Link key={item.routeId} to={item.to as never} className={linkClass}>
            {item.label}
          </Link>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <a {...settings} className={linkClass}>
          Settings
        </a>
        <ThemeToggle />
      </div>
    </header>
  );
}

/** Core's `_app` layout: the header above the matched route. Embedded mode
 * and `staticData.sidebar: "hidden"` drop the header. */
export function CoreLayout() {
  const isEmbedded = useIsEmbedded();
  const hidden = useSidebarMode() === "hidden";
  return (
    <div className="flex h-full flex-col">
      {!isEmbedded && !hidden && <CoreHeader />}
      <main className="relative min-h-0 flex-1">
        <ContentOutlet />
      </main>
    </div>
  );
}
