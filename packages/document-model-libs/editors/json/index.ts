import { lazyWithPreload } from "../utils";
import type { ExtendedEditor } from "../types";

export const module: ExtendedEditor = {
  Component: lazyWithPreload(() => import("./editor")),
  documentTypes: ["*"],
  config: {
    id: "json-editor",
    disableExternalControls: false,
  },
};

export default module;
