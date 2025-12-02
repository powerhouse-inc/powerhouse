import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/app",
  name: "App Module",
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
            "type AppModuleState {\n  name: String!\n  status: StatusType!\n  allowedDocumentTypes: [String!]\n  isDragAndDropEnabled: Boolean!\n}\n\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}",
          initialValue:
            '{\n  "name": "",\n  "status": "DRAFT",\n  "allowedDocumentTypes": null,\n  "isDragAndDropEnabled": true\n}',
          examples: [],
        },
        local: {
          schema: "",
          initialValue: "",
          examples: [],
        },
      },
      modules: [
        {
          id: "d274599a-ceb5-4f2b-8651-b25787306734",
          name: "base_operations",
          description: "",
          operations: [
            {
              id: "f2ba2ddc-8527-4162-93bd-e045e9932013",
              name: "SET_APP_NAME",
              description: "",
              schema: "input SetAppNameInput {\n  name: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "c842efa4-154c-4fd9-9d12-42bec51af4e9",
              name: "SET_APP_STATUS",
              description: "",
              schema: "input SetAppStatusInput {\n  status: StatusType!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "7376f168-695f-4aef-94d0-6e381666358c",
              name: "ADD_DOCUMENT_TYPE",
              description: "",
              schema:
                "input AddDocumentTypeInput {\n  documentType: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "310e4e5b-3f14-4e9a-8e09-5583c7698a65",
              name: "REMOVE_DOCUMENT_TYPE",
              description: "",
              schema:
                "input RemoveDocumentTypeInput {\n  documentType: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "b365727a-7df3-48f0-a4f8-02362f02ad1d",
              name: "SET_DOCUMENT_TYPES",
              description: "",
              schema:
                "input SetDocumentTypesInput {\n  documentTypes: [String!]!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
          ],
        },
        {
          id: "270faa10-92e9-40d0-b128-2de32704bcb5",
          name: "dnd_operations",
          description: "",
          operations: [
            {
              id: "077b1ab8-cb32-4b4e-a1fa-76178188c6a1",
              name: "SET_DRAG_AND_DROP_ENABLED",
              description: "",
              schema:
                "input SetDragAndDropEnabledInput {\n  enabled: Boolean!\n}",
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
