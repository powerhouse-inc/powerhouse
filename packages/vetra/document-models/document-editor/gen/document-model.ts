import type { DocumentModelState } from "document-model";

export const documentModel: DocumentModelState = {
  id: "powerhouse/document-editor",
  name: "Document Editor",
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
            "type DocumentEditorState {\n  name: String!\n  documentTypes: [DocumentTypeItem!]!\n  status: StatusType!\n}\n\ntype DocumentTypeItem {\n  id: OID!\n  documentType: String!\n}\n\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
          initialValue:
            '"{\\n  \\"name\\": \\"\\",\\n  \\"documentTypes\\": [],\\n  \\"status\\": \\"DRAFT\\"\\n}"',
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
          id: "73f6d103-47cb-4074-a736-a3eaf5d079bf",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "50a16f00-d25a-4c97-9632-4ce3b951a402",
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
              id: "acee4272-f29e-4a19-aaf9-bae2cb6652ab",
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
              id: "6c549776-0fc3-4632-a6c7-8721fa6ee41c",
              name: "REMOVE_DOCUMENT_TYPE",
              description: "",
              schema: "input RemoveDocumentTypeInput {\n  id: OID!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "e9aa7f08-553b-452f-a494-126ace6b15f7",
              name: "SET_EDITOR_STATUS",
              description: "",
              schema: "input SetEditorStatusInput {\n  status: StatusType!\n}",
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
