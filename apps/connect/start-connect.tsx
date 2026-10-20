import type {
  LocalPackageSource,
  ModuleNamespace,
} from "@powerhousedao/connect-core";
import type { DocumentModelLib } from "@powerhousedao/shared/document-model";
import { bootConnect } from "./src/boot.js";

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
 * const { updateLocalPackage } = startConnect(localPackage);
 *
 * if (import.meta.hot) {
 *   import.meta.hot.accept(["./index.js"], ([newModule]) => {
 *     if (newModule) {
 *       updateLocalPackage(newModule);
 *     }
 *   });
 * }
 */

export type {
  LocalPackageSource,
  ModuleNamespace,
} from "@powerhousedao/connect-core";

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
  // window.ph is the bound store; a reactor-browser import would join the boot chunk.
  window.ph?.vetraPackageManager?.updateLocalPackage(pkg as DocumentModelLib);
}

export function startConnect(localPackage: LocalPackageSource) {
  // Rendered into the same root the skeleton was painted into, so the swap is
  // a reconciliation rather than a second mount point.
  if (root && components) {
    const pkg = components.loadLocalPackage(localPackage);
    root.render(<components.AppLoader localPackage={pkg} />);
  }

  return {
    updateLocalPackage,
  };
}
