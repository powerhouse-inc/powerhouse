// What a Connect page loads from a dev server with DevTools. The dev server
// serves it as a module of the project, so these imports are the app's own
// copies of React and Connect's router. What the app knows
// reaches DevTools from `window.ph`: this adds what only Connect has.
import { registerConnectPage } from "@powerhousedao/connect/router";
import { useEffect } from "react";
import { mountDevtools, type DevtoolsHandle } from "virtual:ph-devtools/mount";
import { readDevtoolsBase } from "../host.js";
import { DEVTOOLS_PAGE_PATH } from "../paths.js";

type ServedConfig = { connect?: { ai?: { assistantEnabled?: boolean } } };

/** How far reactor-browser's assistant button (`ReactorChatFab`, `right-6`
 * and `size-12`) reaches in from the window's right edge, in rem. */
const ASSISTANT_BUTTON_REACH_REM = 4.5;

/** How far the assistant's button reaches in from the window's right edge,
 * in pixels: 0 without the assistant. */
async function assistantButtonReach(): Promise<number> {
  const response = await fetch(
    `${readDevtoolsBase() ?? "/"}powerhouse.config.json`,
  );
  const config = (await response.json()) as ServedConfig;
  if (!config.connect?.ai?.assistantEnabled) return 0;
  const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return ASSISTANT_BUTTON_REACH_REM * (Number.isFinite(rem) ? rem : 16);
}

/** The route of the standalone page. The mounted DevTools draws the page, so
 * this renders nothing: it tells DevTools while Connect's router is on it. */
function StandaloneRoute({ devtools }: { devtools: DevtoolsHandle }) {
  useEffect(() => {
    devtools.update({ surface: "page" });
    return () => devtools.update({ surface: "auto" });
  }, [devtools]);
  return null;
}

const devtools = mountDevtools();
if (devtools) {
  registerConnectPage({
    path: DEVTOOLS_PAGE_PATH,
    component: () => <StandaloneRoute devtools={devtools} />,
  });
  assistantButtonReach()
    .then((bottomRightReserved) => devtools.update({ bottomRightReserved }))
    // Without the config or the assistant's code, the launcher keeps its corner.
    .catch(() => undefined);
}
