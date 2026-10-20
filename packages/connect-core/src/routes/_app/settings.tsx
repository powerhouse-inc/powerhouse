import type { ConnectRouterContext } from "@powerhousedao/connect-core/router";
import {
  coreView,
  redirectToSettingsTab,
  settingsTitle,
} from "@powerhousedao/connect-core/router";
import type { StaticDataRouteOption } from "@tanstack/react-router";
import { createFileRoute } from "@tanstack/react-router";

/** The settings page's options: the tab redirect and title. Its tabs are its
 * child routes with `staticData.settings`. */
export const options = {
  // Bare /settings and a disabled tab go to the first tab. `any`: checking the
  // router's context against a typed parameter here is circular.
  beforeLoad: redirectToSettingsTab as (context: any) => void,
  // The shown tab's label; a tab needs no head of its own.
  head: ({
    matches,
    match,
  }: {
    matches: readonly { staticData: StaticDataRouteOption }[];
    match: { context: ConnectRouterContext };
  }) => ({
    meta: [
      {
        title: settingsTitle(
          matches.at(-1)?.staticData.settings?.label,
          match.context.appName,
        ),
      },
    ],
  }),
};

// The tab list beside the shown tab.
export const Route = createFileRoute("/_app/settings")({
  ...options,
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  component: coreView("CoreSettingsPage"),
});
