import type { AnyRouter } from "@tanstack/react-router";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { SettingsView } from "../../../router/route-components.js";
import {
  settingsTabsOf,
  settingsTitle,
  showsSettingsTab,
} from "../../../router/settings.js";

// Beside the content layout: the root keeps the sidebar, the content view goes.
export const Route = createFileRoute("/_app/settings")({
  // Core routes stay in the main chunk when a project build splits its routes.
  codeSplitGroupings: [],
  // Bare /settings and a disabled tab go to the first tab.
  beforeLoad: ({ matches, context }) => {
    if (showsSettingsTab(matches, context)) return;
    const first = settingsTabsOf(Route, context).at(0);
    // oxlint-disable-next-line typescript/only-throw-error -- router control flow
    if (!first) throw notFound();
    // oxlint-disable-next-line typescript/only-throw-error -- router control flow
    throw redirect<AnyRouter>({ to: first.to, replace: true, state: true });
  },
  // The shown tab's label; a tab needs no head of its own.
  head: ({ matches, match }) => ({
    meta: [
      {
        title: settingsTitle(
          matches.at(-1)?.staticData.settings?.label,
          match.context.appName,
        ),
      },
    ],
  }),
  component: SettingsView,
});
