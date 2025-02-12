import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";

import * as DocumentDriveModule from "../../document-models/document-drive";

const { meta, CreateDocumentStory: DocumentDrive } = createDocumentStory(
  Editor,
  DocumentDriveModule.reducer,
  DocumentDriveModule.utils.createDocument(),
);
export { DocumentDrive };

export default { ...meta, title: "Generic Drive Explorer" };
