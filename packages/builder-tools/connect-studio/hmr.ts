import "vite/types/customEvent.d.ts";

declare module "vite/types/customEvent.d.ts" {
  interface CustomEventMap {
    "studio:add-external-package": { name: string };
    "studio:remove-external-package": { name: string };
    "studio:external-package-added": { name: string };
    "studio:external-package-removed": { name: string };
  }

  type CustomEventKeys = keyof CustomEventMap;
}

export default import.meta.hot
  ? {
      on: import.meta.hot.on.bind(import.meta.hot),
      off: import.meta.hot.off.bind(import.meta.hot),
      send: import.meta.hot.send.bind(import.meta.hot),
      accept: import.meta.hot.accept.bind(import.meta.hot),
    }
  : undefined;
