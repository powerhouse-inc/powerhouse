import type { ExtendedEditor } from "../types";
import type {
  DocumentModelAction,
  DocumentModelState,
  DocumentModelLocalState,
} from "document-model/document-model";
import { lazyWithPreload } from "document-model-libs/utils";

export const module: ExtendedEditor<
  DocumentModelState,
  DocumentModelAction,
  DocumentModelLocalState
> = {
  Component: lazyWithPreload(() => import("./editor")),
  documentTypes: ["powerhouse/document-model"],
  config: {
    id: "document-model-editor-v2",
    disableExternalControls: true,
    documentToolbarEnabled: true,
  },
};

export default module;

export * from "./context";
export * from "./hooks";
export * from "./components";
export * from "./utils";
export * from "./constants";
export * from "./types";
export * from "./schemas";
