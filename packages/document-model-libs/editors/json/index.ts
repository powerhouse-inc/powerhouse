import { lazyWithPreload } from "document-model-libs/utils";
import type { EditorModule } from "../types";

export const module: EditorModule = {
  Component: lazyWithPreload(() => import("./editor")),
  documentTypes: ["*"],
  config: {
    id: "json-editor",
    disableExternalControls: false,
  },
};

export default module;
