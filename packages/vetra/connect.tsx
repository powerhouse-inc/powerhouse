import { AppLoader } from "@powerhousedao/connect/components";
import type { DocumentModelLib } from "document-model";
import { createRoot } from "react-dom/client";
import * as LocalPackage from "./index.js";
import "./style.css";

const localPackage: DocumentModelLib = {
  ...LocalPackage,
  subgraphs: [],
  importScripts: [],
};

createRoot(document.getElementById("root")!).render(
  <AppLoader packages={[]} localPackage={Promise.resolve(localPackage)} />,
);

if (import.meta.hot) {
  import.meta.hot.accept(console.log);
}
