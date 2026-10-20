import { isPluginActive } from "@powerhousedao/connect-core/plugins";
import type { ComponentType } from "react";
import { GENERIC_PLUGIN } from "../plugins/ids.js";

type View = ComponentType<any> & { preload?: () => unknown };

/** Whether the served composition has the generic plugin; fixed for the page. */
export const genericActive = () => isPluginActive(GENERIC_PLUGIN);

/** Connect's view while the served composition has the generic plugin, else
 * core's. The router preloads the one it will show. */
export function generic<T extends View>(Generic: T, Core: View): T {
  const pick = () => (genericActive() ? Generic : Core);
  function GenericOrCore(props: object) {
    const Shown = pick();
    return <Shown {...props} />;
  }
  return Object.assign(GenericOrCore, {
    preload: async () => {
      await pick().preload?.();
    },
  }) as unknown as T;
}
