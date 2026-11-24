import type { PHGlobal } from "@powerhousedao/reactor-browser";
import { DRIVE_DOCUMENT_TYPES } from "./drive-types.js";
import type { DevtoolsApp } from "./props.js";

/**
 * Where DevTools reads what the app around it knows. `read` answers the same
 * object until something it holds changes, and `subscribe` tells of a change.
 */
export type AppSource = {
  read: () => DevtoolsApp;
  subscribe: (onChange: () => void) => () => void;
};

type PackageManager = NonNullable<PHGlobal["vetraPackageManager"]>;

/** The keys of `window.ph` this source reads. */
const KEYS = [
  "vetraPackageManager",
  "toast",
  "navigation",
] as const satisfies readonly (keyof PHGlobal)[];

function loadedModulesOf(
  manager: PackageManager,
): NonNullable<DevtoolsApp["loadedModules"]> {
  const editors: string[] = [];
  const apps: string[] = [];
  for (const module of manager.packages.flatMap((pkg) => pkg.editors)) {
    const isApp = module.documentTypes.some((type) =>
      DRIVE_DOCUMENT_TYPES.includes(type),
    );
    (isApp ? apps : editors).push(module.config.id);
  }
  return { editors, apps };
}

function readApp(ph: PHGlobal | undefined): DevtoolsApp {
  const { vetraPackageManager, toast, navigation } = ph ?? {};
  return {
    ...(vetraPackageManager && {
      loadedModules: loadedModulesOf(vetraPackageManager),
    }),
    ...(toast && {
      notifyError: (message: string) => void toast(message, { type: "error" }),
    }),
    ...(navigation && {
      removeSearchParam: (name: string) =>
        navigation.setSearch(({ [name]: _removed, ...kept }) => kept, {
          replace: true,
        }),
    }),
  };
}

/**
 * What a Powerhouse app keeps on `window.ph`: its loaded modules, its
 * notifications and its router. It reads the page, not the app's code, so it
 * works on any page that has `window.ph`, and gives nothing on one that has
 * not. A change reaches it through the `ph:<key>Updated` events of the page.
 */
export function powerhouseAppSource(): AppSource {
  let app: DevtoolsApp | undefined;
  const listeners = new Set<() => void>();
  let stopWatching: (() => void) | undefined;

  const changed = () => {
    app = undefined;
    for (const listener of listeners) listener();
  };

  const watch = () => {
    let manager: PackageManager | undefined;
    let leaveManager: (() => void) | undefined;
    // The manager tells of the packages it loads itself.
    const followManager = () => {
      const next = window.ph?.vetraPackageManager;
      if (next === manager) return;
      leaveManager?.();
      manager = next;
      leaveManager = next?.subscribe(changed);
    };
    const onKey = () => {
      followManager();
      changed();
    };
    const events = KEYS.map((key) => `ph:${key}Updated`);
    for (const event of events) window.addEventListener(event, onKey);
    followManager();
    return () => {
      for (const event of events) window.removeEventListener(event, onKey);
      leaveManager?.();
    };
  };

  return {
    read: () => (app ??= readApp(window.ph)),
    subscribe(onChange) {
      if (listeners.size === 0) {
        // What changed while nothing listened was not heard.
        app = undefined;
        stopWatching = watch();
      }
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
        if (listeners.size > 0) return;
        stopWatching?.();
        stopWatching = undefined;
      };
    },
  };
}
