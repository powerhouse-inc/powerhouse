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
  documentTypes: ["powerhouse/document-model-2"],
  config: {
    id: "document-model-editor-2",
    disableExternalControls: false,
  },
};

export default module;
