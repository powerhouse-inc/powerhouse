import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "@powerhousedao/shared/document-model";
import { createRoot } from "react-dom/client";
import { AppLoader } from "./src/components/index.js";

/* Starts your local dev server for Connect.
 *
 * Call this function with the export of your project's index.ts file in your main.tsx file like this:
 *
 * // main.tsx
 * import * as localPackage from "./index.js";
 * startConnect(localPackage);
 */
export function startConnect(localPackage: Partial<DocumentModelLib>) {
  if (!window.ph) {
    window.ph = {};
  }

  const vetraPackage = convertLegacyLibToVetraPackage(
    localPackage as DocumentModelLib,
  );

  createRoot(document.getElementById("root")!).render(
    <AppLoader localPackage={vetraPackage} />,
  );
}
