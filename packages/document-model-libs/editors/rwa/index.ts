import { RWAEditorContextProps } from "@powerhousedao/design-system";
import type {
  RealWorldAssetsState,
  RealWorldAssetsLocalState,
  RealWorldAssetsAction,
} from "../../document-models/real-world-assets";
import type { ExtendedEditor } from "../types";
import { lazyWithPreload } from "../utils";

export const module: ExtendedEditor<
  RealWorldAssetsState,
  RealWorldAssetsAction,
  RealWorldAssetsLocalState,
  RWAEditorContextProps
> = {
  Component: lazyWithPreload(() => import("./editor")),
  documentTypes: ["makerdao/rwa-portfolio"],
  config: {
    id: "rwa-editor",
    disableExternalControls: true,
  },
};

export default module;
