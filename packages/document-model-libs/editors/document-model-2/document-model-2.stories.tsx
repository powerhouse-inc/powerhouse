import { reducer, utils } from "document-model/document-model";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";

const { meta, CreateDocumentStory: DocumentModel2 } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState(),
);

export default { ...meta, title: "Document Model 2" };

export { DocumentModel2 };
