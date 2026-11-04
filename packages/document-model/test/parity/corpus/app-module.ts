import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

const StatusType = ph.enum("StatusType", {
  description:
    "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
  values: ["DRAFT", "CONFIRMED"],
});

const AppModuleState = ph.object("AppModuleState", {
  description:
    "Configuration for a Drive App contributed by the package. Drive apps render a\ncustom view at the drive level (instead of, or alongside, the document file\ntree) and can opt into which document types they accept.",
  fields: {
    name: ph.String({
      required: true,
      description:
        "Display name of the drive app. Also used as the source for the generated folder name under `editors/`.",
    }),
    status: ph.ref(StatusType, {
      required: true,
      description:
        "Lifecycle status. While DRAFT the app definition is editable and codegen is skipped; switching to CONFIRMED triggers app scaffold generation.",
    }),
    allowedDocumentTypes: ph.list(ph.String({ required: true }), {
      description:
        "Document type ids this app handles. `null` and an empty list both mean the app accepts every document type.",
    }),
    isDragAndDropEnabled: ph.Boolean({
      required: true,
      description:
        "Whether the app surface accepts dropped files from the user. Defaults to true.",
    }),
  },
});

const context = defineDocumentModel({
  id: "powerhouse/app",
  name: "App Module",
  description:
    "Declares a custom Drive App (a drive-level UI surface) shipped by a Vetra Reactor Package. Use one App Module document per drive app: configure which document types it handles, whether it accepts drag-and-drop, and mark it CONFIRMED to trigger codegen of the corresponding app scaffold under `editors/<app-id>/`.",
  extension: ".app",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: {
      schema: AppModuleState,
      initialValue: {
        name: "",
        status: "DRAFT",
        allowedDocumentTypes: null,
        isDragAndDropEnabled: true,
      },
    },
    local: { schema: null, initialValue: {} },
  },
});

const baseOperations = context.module("baseOperations", {
  description:
    "Set the app's identity, lifecycle status, and the document types it handles.",
  operations: ({ global }) => ({
    setAppName: global({
      description:
        "Set the display name of the drive app. Also determines the generated folder name under `editors/`.",
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setAppStatus: global({
      description:
        "Move the app between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
      input: ph.input({
        fields: {
          status: ph.ref(StatusType, { required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addDocumentType: global({
      description:
        "Append a document type id to the list of types this app handles. The first type added narrows the app from every type to the listed ones.",
      input: ph.input({
        fields: {
          documentType: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeDocumentType: global({
      description:
        "Remove a document type id from the handled list. No-op if the type is not present. Removing the last type leaves an empty list, which accepts every type.",
      input: ph.input({
        fields: {
          documentType: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setDocumentTypes: global({
      description:
        "Replace the entire allowed-document-types list in one call. An empty list accepts every document type.",
      input: ph.input({
        fields: {
          documentTypes: ph.list(ph.String({ required: true }), {
            required: true,
          }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

const dndOperations = context.module("dndOperations", {
  description: "Toggle drag-and-drop file handling for the app surface.",
  operations: ({ global }) => ({
    setDragAndDropEnabled: global({
      description:
        "Enable or disable drag-and-drop file handling on the app surface.",
      input: ph.input({
        fields: {
          enabled: ph.Boolean({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const appModule = materialize(
  context.version({ modules: [baseOperations, dndOperations] }),
);
