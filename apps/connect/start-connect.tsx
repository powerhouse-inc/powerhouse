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

// Type for Vite HMR modules
export type ModuleNamespace = Record<string, any> & {
  [Symbol.toStringTag]: "Module";
};

function updateLocalPackage(pkg: DocumentModelLib | ModuleNamespace) {
  window.ph?.vetraPackageManager?.updateLocalPackage(pkg as DocumentModelLib);
}

export function startConnect(localPackage: Partial<DocumentModelLib>) {
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
