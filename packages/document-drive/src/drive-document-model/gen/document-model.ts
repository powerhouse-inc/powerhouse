import { documentModelName, documentType, fileExtension } from "./constants.js";
import { DocumentDriveState } from "./schema/types.js";

export const documentModelState: DocumentDriveState = {
  id: documentType,
  name: documentModelName,
  nodes: [],
  icon: null,
  slug: null,
};
