/**
 * The code-first declaration of app-module, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

const StatusType = ph.enum("StatusType", {
  description:
    "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
  values: ["DRAFT", "CONFIRMED"],
});

const contextV1 = defineDocumentModel({
  id: "powerhouse/app",
  name: "App Module",
  description:
    "Declares a custom Drive App (a drive-level UI surface) shipped by a Vetra Reactor Package. Use one App Module document per drive app: configure which document types it handles, whether it accepts drag-and-drop, and mark it CONFIRMED to trigger codegen of the corresponding app scaffold under `apps/`.",
  extension: ".app",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("AppModuleState", {
        description:
          "Configuration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.",
        fields: {
          name: ph.String({
            required: true,
            description:
              "Display name of the drive app. Also used as the source for the generated folder name under `apps/`.",
          }),
          status: ph.ref(StatusType, {
            required: true,
            description:
              "Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation.",
          }),
          allowedDocumentTypes: ph.list(ph.String({ required: true }), {
            description:
              "Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none.",
          }),
          isDragAndDropEnabled: ph.Boolean({
            required: true,
            description:
              "Whether the app surface accepts dropped files from the user. Defaults to true.",
          }),
        },
      }),
      initialValue: {
        name: "",
        status: "DRAFT",
        allowedDocumentTypes: null,
        isDragAndDropEnabled: true,
      },
    },
    local: {
      schema: null,
      initialValue: {},
    },
  },
});

const baseOperationsV1 = contextV1.module("baseOperations", {
  description:
    "Set the app's identity, lifecycle status, and the document types it handles.",
  operations: ({ global }) => ({
    setAppName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set the display name of the drive app. Also determines the generated folder name under `apps/`.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setAppStatus: global({
      input: ph.input({
        fields: {
          status: ph.ref(StatusType, { required: true }),
        },
      }),
      description:
        "Move the app between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addDocumentType: global({
      input: ph.input({
        fields: {
          documentType: ph.String({ required: true }),
        },
      }),
      description:
        "Append a document type id to the list of types this app handles. Initializes the list if it was `null` (accept-any).",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeDocumentType: global({
      input: ph.input({
        fields: {
          documentType: ph.String({ required: true }),
        },
      }),
      description:
        "Remove a document type id from the handled list. No-op if the type is not present.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setDocumentTypes: global({
      input: ph.input({
        fields: {
          documentTypes: ph.list(ph.String({ required: true }), {
            required: true,
          }),
        },
      }),
      description:
        "Replace the entire allowed-document-types list in one call. Pass an empty list to accept none.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

const dndOperationsV1 = contextV1.module("dndOperations", {
  description: "Toggle drag-and-drop file handling for the app surface.",
  operations: ({ global }) => ({
    setDragAndDropEnabled: global({
      input: ph.input({
        fields: {
          enabled: ph.Boolean({ required: true }),
        },
      }),
      description:
        "Enable or disable drag-and-drop file handling on the app surface.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = contextV1.finalize({
  modules: [baseOperationsV1, dndOperationsV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/baseOperations": "d274599a-ceb5-4f2b-8651-b25787306734",
      "operation/baseOperations/setAppName":
        "f2ba2ddc-8527-4162-93bd-e045e9932013",
      "operation/baseOperations/setAppStatus":
        "c842efa4-154c-4fd9-9d12-42bec51af4e9",
      "operation/baseOperations/addDocumentType":
        "7376f168-695f-4aef-94d0-6e381666358c",
      "operation/baseOperations/removeDocumentType":
        "310e4e5b-3f14-4e9a-8e09-5583c7698a65",
      "operation/baseOperations/setDocumentTypes":
        "b365727a-7df3-48f0-a4f8-02362f02ad1d",
      "module/dndOperations": "270faa10-92e9-40d0-b128-2de32704bcb5",
      "operation/dndOperations/setDragAndDropEnabled":
        "077b1ab8-cb32-4b4e-a1fa-76178188c6a1",
    },
    names: {
      "module/baseOperations": { storedName: "base_operations" },
      "operation/baseOperations/setAppName": { storedName: "SET_APP_NAME" },
      "operation/baseOperations/setAppStatus": { storedName: "SET_APP_STATUS" },
      "operation/baseOperations/addDocumentType": {
        storedName: "ADD_DOCUMENT_TYPE",
      },
      "operation/baseOperations/removeDocumentType": {
        storedName: "REMOVE_DOCUMENT_TYPE",
      },
      "operation/baseOperations/setDocumentTypes": {
        storedName: "SET_DOCUMENT_TYPES",
      },
      "module/dndOperations": { storedName: "dnd_operations" },
      "operation/dndOperations/setDragAndDropEnabled": {
        storedName: "SET_DRAG_AND_DROP_ENABLED",
      },
    },
    serialization: {
      "state/global/schema":
        '"""\nConfiguration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.\n"""\ntype AppModuleState {\n  """Display name of the drive app. Also used as the source for the generated folder name under `apps/`."""\n  name: String!\n  """Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation."""\n  status: StatusType!\n  """Document type ids this app handles. `null` means the app accepts any document type; an empty list means it accepts none."""\n  allowedDocumentTypes: [String!]\n  """Whether the app surface accepts dropped files from the user. Defaults to true."""\n  isDragAndDropEnabled: Boolean!\n}\n\n"""\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n"""\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}',
      "state/global/initialValue":
        '{\n  "name": "",\n  "status": "DRAFT",\n  "allowedDocumentTypes": null,\n  "isDragAndDropEnabled": true\n}',
      "state/local/initialValue": "",
      "operation/baseOperations/setAppName/schema":
        "input SetAppNameInput {\n  name: String!\n}",
      "operation/baseOperations/setAppStatus/schema":
        "input SetAppStatusInput {\n  status: StatusType!\n}",
      "operation/baseOperations/addDocumentType/schema":
        "input AddDocumentTypeInput {\n  documentType: String!\n}",
      "operation/baseOperations/removeDocumentType/schema":
        "input RemoveDocumentTypeInput {\n  documentType: String!\n}",
      "operation/baseOperations/setDocumentTypes/schema":
        "input SetDocumentTypesInput {\n  documentTypes: [String!]!\n}",
      "operation/dndOperations/setDragAndDropEnabled/schema":
        "input SetDragAndDropEnabledInput {\n  enabled: Boolean!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
