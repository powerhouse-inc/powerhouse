import { DocumentDriveLocalState, DocumentDriveState } from "./types.js";

export const fileExtension = "phdd" as const;
export const documentType = "powerhouse/document-drive" as const;
export const documentModelName = "DocumentDrive" as const;

export const initialGlobalState: DocumentDriveState = {
  id: "",
  name: "",
  nodes: [],
  icon: null,
  slug: null,
  author: {
    name: "",
    website: "",
  },
  description: "",
  extension: "",
  specifications: [],
};

export const initialLocalState: DocumentDriveLocalState = {
  listeners: [],
  triggers: [],
  sharingType: "private",
  availableOffline: false,
};