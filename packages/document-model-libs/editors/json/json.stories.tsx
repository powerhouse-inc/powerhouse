import { Meta } from "@storybook/react";
import {
  BaseDocument,
  SignalDispatch,
  baseReducer,
  utils,
} from "document-model";
import { createDocumentStory } from "document-model-libs/utils";
import Editor from "./editor";

const { meta, CreateDocumentStory: JSONEditor } = createDocumentStory(
  Editor,
  (
    state: PHDocument,
    action: any,
    dispatch: SignalDispatch | undefined,
  ) => baseReducer(state, action, (document) => document, dispatch),
  utils.createExtendedState(),
);

export default { ...meta, title: "JSON Editor" } as Meta<typeof Editor>;

export { JSONEditor };
