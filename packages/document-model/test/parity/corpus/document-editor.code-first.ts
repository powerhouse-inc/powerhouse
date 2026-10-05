/**
 * The code-first declaration of document-editor, equivalent to the stored
 * schema-first model in this repository down to every persisted byte.
 *
 * Reducers are empty: this fixture proves specification equality, which is
 * what `test/parity` compares. `test/replay` covers replay behavior with
 * its own pair.
 */
import { ph } from "../../../src/definition/field.js";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { defineDocumentModel } from "../../../src/definition/model.js";

const DocumentTypeItem = ph.object("DocumentTypeItem", {
  description:
    "A document type id (e.g. 'powerhouse/document-drive') attached to the editor with a stable entry id.",
  fields: {
    id: ph.OID({
      required: true,
      description: "Stable identifier for the entry; used to remove it.",
    }),
    documentType: ph.String({
      required: true,
      description:
        "Document type id this editor handles (e.g. 'my-org/invoice').",
    }),
  },
});

const StatusType = ph.enum("StatusType", {
  description:
    "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
  values: ["DRAFT", "CONFIRMED"],
});

const contextV1 = defineDocumentModel({
  id: "powerhouse/document-editor",
  name: "Document Editor",
  description:
    "Declares a document editor (a React UI for editing instances of one or more document models) shipped by a Vetra Reactor Package. Create one Document Editor document per editor, list the document types it can edit, then mark it CONFIRMED to trigger codegen of the editor scaffold under `editors/`. The boilerplate it produces is what you then customize.",
  extension: ".editor",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("DocumentEditorState", {
        description:
          "Configuration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.",
        fields: {
          name: ph.String({
            required: true,
            description:
              "Display name of the editor. Also determines the generated folder name under `editors/`.",
          }),
          documentTypes: ph.list(ph.ref(DocumentTypeItem, { required: true }), {
            required: true,
            description:
              "Document types this editor can edit. Each entry has a stable id so it can be removed individually.",
          }),
          status: ph.ref(StatusType, {
            required: true,
            description:
              "Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
          }),
        },
      }),
      initialValue: {
        name: "",
        documentTypes: [],
        status: "DRAFT",
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
    "Set the editor's identity, lifecycle status, and the document types it handles.",
  operations: ({ global }) => ({
    setEditorName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set the display name of the editor. Also determines the generated folder name under `editors/`.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addDocumentType: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          documentType: ph.String({ required: true }),
        },
      }),
      description:
        "Register a document type this editor can edit. Caller supplies a stable id so the entry can be removed later.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeDocumentType: global({
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
        },
      }),
      description: "Remove a registered document type entry by its id.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setEditorStatus: global({
      input: ph.input({
        fields: {
          status: ph.ref(StatusType, { required: true }),
        },
      }),
      description:
        "Move the editor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED — leaving it DRAFT means no editor files are produced.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = contextV1.finalize({
  modules: [baseOperationsV1],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/baseOperations": "73f6d103-47cb-4074-a736-a3eaf5d079bf",
      "operation/baseOperations/setEditorName":
        "50a16f00-d25a-4c97-9632-4ce3b951a402",
      "operation/baseOperations/addDocumentType":
        "acee4272-f29e-4a19-aaf9-bae2cb6652ab",
      "operation/baseOperations/removeDocumentType":
        "6c549776-0fc3-4632-a6c7-8721fa6ee41c",
      "operation/baseOperations/setEditorStatus":
        "e9aa7f08-553b-452f-a494-126ace6b15f7",
    },
    names: {
      "module/baseOperations": { storedName: "base_operations" },
      "operation/baseOperations/setEditorName": {
        storedName: "SET_EDITOR_NAME",
      },
      "operation/baseOperations/addDocumentType": {
        storedName: "ADD_DOCUMENT_TYPE",
      },
      "operation/baseOperations/removeDocumentType": {
        storedName: "REMOVE_DOCUMENT_TYPE",
      },
      "operation/baseOperations/setEditorStatus": {
        storedName: "SET_EDITOR_STATUS",
      },
    },
    serialization: {
      "state/global/schema":
        '"""\nConfiguration for a document editor contributed by the package. The editor is\nregistered against every document type listed in `documentTypes`; Connect picks\nthe first matching editor when opening a document.\n"""\ntype DocumentEditorState {\n  """Display name of the editor. Also determines the generated folder name under `editors/`."""\n  name: String!\n  """Document types this editor can edit. Each entry has a stable id so it can be removed individually."""\n  documentTypes: [DocumentTypeItem!]!\n  """Lifecycle status. While DRAFT the editor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation."""\n  status: StatusType!\n}\n\n"""A document type id (e.g. \'powerhouse/document-drive\') attached to the editor with a stable entry id."""\ntype DocumentTypeItem {\n  """Stable identifier for the entry; used to remove it."""\n  id: OID!\n  """Document type id this editor handles (e.g. \'my-org/invoice\')."""\n  documentType: String!\n}\n\n"""\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n"""\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}',
      "state/global/initialValue":
        '{\n  "name": "",\n  "documentTypes": [],\n  "status": "DRAFT"\n}',
      "state/local/initialValue": "",
      "operation/baseOperations/setEditorName/schema":
        "input SetEditorNameInput {\n  name: String!\n}",
      "operation/baseOperations/addDocumentType/schema":
        "input AddDocumentTypeInput {\n  id: OID!\n  documentType: String!\n}",
      "operation/baseOperations/removeDocumentType/schema":
        "input RemoveDocumentTypeInput {\n  id: OID!\n}",
      "operation/baseOperations/setEditorStatus/schema":
        "input SetEditorStatusInput {\n  status: StatusType!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
