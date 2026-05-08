import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  description: "",
  extension: ".phdm",
  id: "powerhouse/document-editor",
  name: "Document Editor",
  specifications: [
    {
      changeLog: [],
      modules: [
        {
          description: "",
          id: "73f6d103-47cb-4074-a736-a3eaf5d079bf",
          name: "base_operations",
          operations: [
            {
              description: "",
              errors: [],
              examples: [],
              id: "50a16f00-d25a-4c97-9632-4ce3b951a402",
              name: "SET_EDITOR_NAME",
              reducer: "",
              schema: "input SetEditorNameInput {\n  name: String!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "acee4272-f29e-4a19-aaf9-bae2cb6652ab",
              name: "ADD_DOCUMENT_TYPE",
              reducer: "",
              schema:
                "input AddDocumentTypeInput {\n  id: OID!\n  documentType: String!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "6c549776-0fc3-4632-a6c7-8721fa6ee41c",
              name: "REMOVE_DOCUMENT_TYPE",
              reducer: "",
              schema: "input RemoveDocumentTypeInput {\n  id: OID!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "e9aa7f08-553b-452f-a494-126ace6b15f7",
              name: "SET_EDITOR_STATUS",
              reducer: "",
              schema: "input SetEditorStatusInput {\n  status: StatusType!\n}",
              template: "",
              scope: "global",
            },
          ],
        },
      ],
      state: {
        global: {
          examples: [],
          initialValue:
            '{\n  "name": "",\n  "documentTypes": [],\n  "status": "DRAFT"\n}',
          schema:
            "type DocumentEditorState {\n  name: String!\n  documentTypes: [DocumentTypeItem!]!\n  status: StatusType!\n}\n\ntype DocumentTypeItem {\n  id: OID!\n  documentType: String!\n}\n\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
        },
        local: {
          examples: [],
          initialValue: "",
          schema: "",
        },
      },
      version: 1,
    },
  ],
};
