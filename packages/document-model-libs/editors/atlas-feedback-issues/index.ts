import { ExtendedEditor, EditorContextProps } from "document-model-libs";
import Editor from "./editor";
import {
  AtlasFeedbackIssuesState,
  AtlasFeedbackIssuesAction,
  AtlasFeedbackIssuesLocalState,
} from "../../document-models/atlas-feedback-issues";
import { lazyWithPreload } from "document-model-libs/utils";

export const module: ExtendedEditor<
  AtlasFeedbackIssuesState,
  AtlasFeedbackIssuesAction,
  AtlasFeedbackIssuesLocalState
> = {
  Component: lazyWithPreload(() => import("./editor")),
  documentTypes: ["makerdao/atlas-feedback-issues"],
  config: {
    id: "makerdao/atlas-feedback-issues",
    disableExternalControls: true,
    documentToolbarEnabled: true,
    showSwitchboardLink: true,
  },
};

export default module;
