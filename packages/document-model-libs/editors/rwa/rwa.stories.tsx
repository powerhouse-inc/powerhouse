import {
  createDocumentStory,
  EditorStoryComponent,
} from "document-model-libs/utils";
import {
  RealWorldAssetsAction,
  RealWorldAssetsLocalState,
  RealWorldAssetsState,
  reducer,
  utils,
} from "../../document-models/real-world-assets";
import { initialState } from "../../document-models/real-world-assets/mock-data/initial-state";
import Editor from "./editor";

const { meta, CreateDocumentStory: RealWorldAssets } = createDocumentStory(
  Editor as EditorStoryComponent<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
  >,
  reducer,
  utils.createExtendedState({
    state: {
      global: initialState,
      local: {},
    },
  }),
  {
    isAllowedToCreateDocuments: true,
    isAllowedToEditDocuments: true,
  },
);

export default {
  ...meta,
  title: "Real World Assets",
};

export { RealWorldAssets };
