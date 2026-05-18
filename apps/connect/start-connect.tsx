import type { DocumentModelLib } from "@powerhousedao/shared/document-model";
import { createRoot } from "react-dom/client";
import { loadRuntimeConfig } from "./src/runtime-config.js";

// Bootstrap the runtime config BEFORE the React tree imports. Any module that
// imports start-connect.tsx — including the codegen-generated main.tsx —
// suspends on this top-level await, so by the time the dynamic import of
// AppLoader resolves, the ConfigLoader cache is warm and connect.config.ts
// can read getRuntimeConfig() synchronously at module evaluation.
await loadRuntimeConfig();

const { AppLoader } = await import("./src/components/index.js");

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

export function startConnect(localPackage: DocumentModelLib<any>) {
  if (!window.ph) {
    window.ph = {};
  }

  createRoot(document.getElementById("root")!).render(
    <AppLoader localPackage={localPackage as DocumentModelLib} />,
  );

  return {
    updateLocalPackage,
  };
}
