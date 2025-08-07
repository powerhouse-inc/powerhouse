import type { DocumentModelState } from "document-model";

export const documentModel: DocumentModelState = {
  id: "powerhouse/document-editor",
  name: "Document Editor",
  extension: ".phdm",
  description: "Powerhouse document editor document model",
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
            "type DocumentEditorState {\n  name: String\n  id: OID\n  documentTypes: [DocumentTypeItem!]!\n}\n\ntype DocumentTypeItem {\n  id: OID!\n  documentType: String!\n}",
          initialValue:
            '"{\\n  \\"name\\": null,\\n  \\"id\\": null,\\n  \\"documentTypes\\": []\\n}"',
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
          id: "14bfe34c-0d19-43d8-b15e-1deba793a739",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "047acd27-caa4-48e9-b628-9f970318d1a7",
              name: "SET_EDITOR_NAME",
              description: "",
              schema: "input SetEditorNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "28a1c183-8ad5-4bd9-9893-48266961793c",
              name: "SET_EDITOR_ID",
              description: "",
              schema: "input SetEditorIdInput {\n  id: OID!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "bdb3a85d-c29d-4a63-8397-2e14eae8215e",
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
              id: "222bf8c4-c4f1-4cf6-9e95-8aa7d703fcd2",
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
