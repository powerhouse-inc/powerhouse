import type { DocumentModelState } from "document-model";

export const documentModel: DocumentModelState = {
  id: "powerhouse/processor",
  name: "Processor Module",
  extension: ".phdm",
  description: "",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type ProcessorModuleState {\n  name: String!\n  type: String!\n  documentTypes: [DocumentTypeItem!]!\n}\n\ntype DocumentTypeItem {\n  id: OID!\n  documentType: String!\n}",
          initialValue:
            '"{\\n  \\"name\\": \\"\\",\\n  \\"type\\": \\"\\",\\n  \\"documentTypes\\": []\\n}"',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: '""',
          examples: [],
        },
      },
      modules: [
        {
          id: "91ad39c1-4e8b-4127-b3c8-e835b85e6360",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "6f3a5c90-39f2-4302-a073-6195a71c5054",
              name: "SET_PROCESSOR_NAME",
              description: "",
              schema: "input SetProcessorNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "b8f28bb4-c6ae-40e6-86fa-29ef14ff8667",
              name: "SET_PROCESSOR_TYPE",
              description: "",
              schema: "input SetProcessorTypeInput {\n  type: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "fbbd7a71-c495-4efc-b8f6-1e57798dbbb4",
              name: "ADD_DOCUMENT_TYPE",
              description: "",
              schema:
                "input AddDocumentTypeInput {\n  id: OID!\n  documentType: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "544d413f-423c-4d97-9570-84a19bffeab9",
              name: "REMOVE_DOCUMENT_TYPE",
              description: "",
              schema: "input RemoveDocumentTypeInput {\n  id: OID!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};
