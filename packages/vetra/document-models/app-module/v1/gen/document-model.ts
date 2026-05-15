import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  id: "powerhouse/app",
  name: "App Module",
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  extension: ".app",
  description:
    "Declares a custom Drive App (a drive-level UI surface) shipped by a Vetra Reactor Package. Use one App Module document per drive app: configure which document types it handles, whether it accepts drag-and-drop, and mark it CONFIRMED to trigger codegen of the corresponding app scaffold under `apps/`.",
  specifications: [
    {
      state: {
        local: {
          schema: "",
          examples: [],
          initialValue: "",
        },
        global: {
          schema:
            '"""\nConfiguration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.\n"""\ntype AppModuleState {\n  """Display name of the drive app. Also used as the source for the generated folder name under `apps/`."""\n  name: String!\n  """Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation."""\n  status: StatusType!\n  """Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none."""\n  allowedDocumentTypes: [String!]\n  """Whether the app surface accepts dropped files from the user. Defaults to true."""\n  isDragAndDropEnabled: Boolean!\n}\n\n"""\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n"""\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}',
          examples: [],
          initialValue:
            '{\n  "name": "",\n  "status": "DRAFT",\n  "allowedDocumentTypes": null,\n  "isDragAndDropEnabled": true\n}',
        },
      },
      modules: [
        {
          id: "d274599a-ceb5-4f2b-8651-b25787306734",
          name: "base_operations",
          description:
            "Set the app's identity, lifecycle status, and the document types it handles.",
          operations: [
            {
              id: "f2ba2ddc-8527-4162-93bd-e045e9932013",
              name: "SET_APP_NAME",
              description:
                "Set the display name of the drive app. Also determines the generated folder name under `apps/`.",
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
              description:
                "Move the app between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
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
              description:
                "Append a document type id to the list of types this app handles. Initializes the list if it was `null` (accept-any).",
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
              description:
                "Remove a document type id from the handled list. No-op if the type is not present.",
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
              description:
                "Replace the entire allowed-document-types list in one call. Pass an empty list to accept none.",
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
          description:
            "Toggle drag-and-drop file handling for the app surface.",
          operations: [
            {
              id: "077b1ab8-cb32-4b4e-a1fa-76178188c6a1",
              name: "SET_DRAG_AND_DROP_ENABLED",
              description:
                "Enable or disable drag-and-drop file handling on the app surface.",
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
      version: 1,
      changeLog: [],
    },
  ],
};
