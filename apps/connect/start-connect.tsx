import type { DocumentModelLib } from "@powerhousedao/shared/document-model";
import { bootConnect } from "./src/boot.js";
import { mountPackageStyles } from "./src/package-styles.js";

// Paint the config-independent skeleton, then bootstrap the runtime config,
// BEFORE the React tree imports. Any module that imports start-connect.tsx —
// including the codegen-generated main.tsx — suspends on this top-level await,
// so by the time the dynamic import of AppLoader resolves, the ConfigLoader
// cache is warm and connect.config.ts can read getRuntimeConfig()
// synchronously at module evaluation.
const root = await bootConnect();

// `null` means startup failed and bootConnect has painted the error state; the
// app graph must not be imported, since its modules read the config at
// module-evaluation and would throw.
const components = root ? await import("./src/components/index.js") : null;

/* Starts your local dev server for Connect.
 *
 * Call this function with the export of your project's index.ts file in your main.tsx file like this:
 *
 * // main.tsx
 * import * as localPackage from "./index.js";
 * import styles from "./style.css?inline";
 * const { updateLocalPackage } = startConnect(localPackage, { styles });
 *
 * if (import.meta.hot) {
 *   import.meta.hot.accept(["./index.js"], ([newModule]) => {
 *     if (newModule) {
 *       updateLocalPackage(newModule);
 *     }
 *   });
 * }
 */

// Type for Vite HMR modules
export type ModuleNamespace = Record<string, any> & {
  [Symbol.toStringTag]: "Module";
};

/** `import.meta` extended with the minimal subset of Vite's HMR API used by the
 * codegen-generated `main.tsx`. Exported so consumer projects can cast
 * `import.meta` to it without pulling `vite/client` into their tsconfig `types`. */
export type ImportHmr = ImportMeta & {
  hot?: {
    accept(
      deps: readonly string[],
      cb: (mods: Array<ModuleNamespace | undefined>) => void,
    ): void;
  };
};

function updateLocalPackage(pkg: DocumentModelLib<any> | ModuleNamespace) {
  window.ph?.vetraPackageManager?.updateLocalPackage(pkg as DocumentModelLib);
}

export interface StartConnectOptions {
  /** The project's compiled package stylesheet, e.g. `./style.css?inline`. */
  styles?: string;
}

// The project's own package, styled like any installed one.
const LOCAL_STYLES = "local-package";

function updateLocalStyles(styles: string) {
  mountPackageStyles(LOCAL_STYLES, styles);
}

export function startConnect(
  localPackage: DocumentModelLib<any>,
  options: StartConnectOptions = {},
) {
  if (options.styles !== undefined) updateLocalStyles(options.styles);
  // Rendered into the same root the skeleton was painted into, so the swap is
  // a reconciliation rather than a second mount point.
  if (root && components) {
    root.render(
      <components.AppLoader localPackage={localPackage as DocumentModelLib} />,
    );
  }

  return {
    updateLocalPackage,
    updateLocalStyles,
  };
}
