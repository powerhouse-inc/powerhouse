import { convertLegacyLibToVetraPackage } from "@powerhousedao/reactor-browser";
import type { DocumentModelLib } from "document-model";
import { createRoot } from "react-dom/client";
import { AppLoader } from "./src/components/index.js";

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
