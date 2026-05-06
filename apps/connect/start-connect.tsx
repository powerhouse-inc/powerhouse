import type { DocumentModelLib } from "@powerhousedao/shared/document-model";
import { createRoot } from "react-dom/client";
import { AppLoader } from "./src/components/index.js";

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

/** `import.meta` extended with the minimal subset of Vite's HMR API used by the
 * codegen-generated `main.tsx`. Exported so consumer projects can cast
 * `import.meta` to it without pulling `vite/client` into their tsconfig `types`. */
export type ImportHmr = ImportMeta & {
  hot?: {
    accept(
      deps: readonly string[],
      cb: (mods: Array<DocumentModelLib<any> | undefined>) => void,
    ): void;
  };
};

function updateLocalPackage(pkg: DocumentModelLib<any>) {
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
