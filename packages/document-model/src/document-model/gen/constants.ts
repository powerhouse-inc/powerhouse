import type {
  DocumentModelLocalState,
  DocumentModelState,
} from "document-model";

export const documentModelState: DocumentModelState = {
  id: "",
  name: "",
  extension: "",
  description: "",
  author: {
    name: "",
    website: "",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema: "",
          initialValue: "",
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [],
    },
  ],
};

export const initialLocalState: DocumentModelLocalState = {};

export const documentModelFileExtension = "phdm" as const;

export const documentType = "powerhouse/document-model" as const;

export const documentModelName = "DocumentModel" as const;
