import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  description: "",
  extension: ".phdm",
  id: "powerhouse/processor",
  name: "Processor Module",
  specifications: [
    {
      changeLog: [],
      modules: [
        {
          description: "",
          id: "91ad39c1-4e8b-4127-b3c8-e835b85e6360",
          name: "base_operations",
          operations: [
            {
              description: "",
              errors: [],
              examples: [],
              id: "6f3a5c90-39f2-4302-a073-6195a71c5054",
              name: "SET_PROCESSOR_NAME",
              reducer: "",
              schema: "input SetProcessorNameInput {\n  name: String!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "b8f28bb4-c6ae-40e6-86fa-29ef14ff8667",
              name: "SET_PROCESSOR_TYPE",
              reducer: "",
              schema: "input SetProcessorTypeInput {\n  type: String!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "fbbd7a71-c495-4efc-b8f6-1e57798dbbb4",
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
              id: "544d413f-423c-4d97-9570-84a19bffeab9",
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
              id: "df5eb500-7308-498c-9b80-028878ee198b",
              name: "ADD_PROCESSOR_APP",
              reducer: "",
              schema:
                "input AddProcessorAppInput {\n processorApp: String! \n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "07e4168f-1a7b-41ef-953d-219028be7bb9",
              name: "REMOVE_PROCESSOR_APP",
              reducer: "",
              schema:
                "input RemoveProcessorAppInput {\n processorApp: String! \n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "7b6706eb-5e25-4d64-829a-e3a251380fd1",
              name: "SET_PROCESSOR_STATUS",
              reducer: "",
              schema:
                "input SetProcessorStatusInput {\n  status: StatusType!\n}",
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
            '{\n  "name": "",\n  "type": "",\n  "documentTypes": [],\n  "status": "DRAFT",\n "processorApps": []\n}',
          schema:
            "type ProcessorModuleState {\n  name: String!\n  type: String!\n  documentTypes: [DocumentTypeItem!]!\n  status: StatusType!\n processorApps: [String!]!\n}\n\ntype DocumentTypeItem {\n  id: OID!\n  documentType: String!\n}\n\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
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
