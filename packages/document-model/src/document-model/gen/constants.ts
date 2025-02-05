import { DocumentModelState, DocumentModelLocalState } from "./types.js";

export const initialGlobalState: DocumentModelState = {
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

export const fileExtension = "phdm" as const;

export const documentType = "powerhouse/document-model" as const;
