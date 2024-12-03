import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";
import { baseReducer, utils } from "document-model/document";

const { meta, CreateDocumentStory: AtlasFeedbackIssues } = createDocumentStory(
  Editor,
  (...args) => baseReducer(...args, (document) => document),
  utils.createExtendedState(),
);
export { AtlasFeedbackIssues };

export default { ...meta, title: "Atlas Feedback Issues" };
