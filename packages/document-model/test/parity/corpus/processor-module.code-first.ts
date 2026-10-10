/**
 * The code-first declaration of processor-module, equivalent to the stored
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
    "A document type id (e.g. 'my-org/invoice') attached to the processor with a stable entry id.",
  fields: {
    id: ph.OID({
      required: true,
      description: "Stable identifier for the entry; used to remove it.",
    }),
    documentType: ph.String({
      required: true,
      description: "Document type id this processor subscribes to.",
    }),
  },
});

const StatusType = ph.enum("StatusType", {
  description:
    "Lifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.",
  values: ["DRAFT", "CONFIRMED"],
});

const contextV1 = defineDocumentModel({
  id: "powerhouse/processor",
  name: "Processor Module",
  description:
    "Declares a processor (a server-side function that reacts to document operations to build read models, send notifications, sync to external systems, etc.) shipped by a Vetra Reactor Package. Create one Processor Module document per processor: pick the processor type, list the document types it subscribes to, attach it to any drive apps that should run it, and mark it CONFIRMED to trigger codegen of the processor scaffold under `processors/`.",
  extension: ".processor",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  specifications: {
    global: {
      schema: ph.object("ProcessorModuleState", {
        description:
          "Configuration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).",
        fields: {
          name: ph.String({
            required: true,
            description:
              "Display name of the processor. Also determines the generated folder name under `processors/`.",
          }),
          type: ph.String({
            required: true,
            description:
              "Processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
          }),
          documentTypes: ph.list(ph.ref(DocumentTypeItem, { required: true }), {
            required: true,
            description:
              "Document types this processor subscribes to. Each entry has a stable id so it can be removed individually.",
          }),
          status: ph.ref(StatusType, {
            required: true,
            description:
              "Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation.",
          }),
          processorApps: ph.list(ph.String({ required: true }), {
            required: true,
            description:
              "Drive-app names this processor is attached to. The processor runs in the context of each listed app.",
          }),
        },
      }),
      initialValue: {
        name: "",
        type: "",
        documentTypes: [],
        status: "DRAFT",
        processorApps: [],
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
    "Set the processor's identity, kind, lifecycle status, subscribed document types, and attached drive apps.",
  operations: ({ global }) => ({
    setProcessorName: global({
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      description:
        "Set the display name of the processor. Also determines the generated folder name under `processors/`.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setProcessorType: global({
      input: ph.input({
        fields: {
          type: ph.String({ required: true }),
        },
      }),
      description:
        "Set the processor implementation kind (e.g. 'read-model', 'relational-db'). Determines which scaffold codegen emits.",
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
        "Subscribe the processor to a document type. Caller supplies a stable id so the entry can be removed later.",
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
      description:
        "Unsubscribe the processor from a document type by removing its entry id.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addProcessorApp: global({
      input: ph.input({
        fields: {
          processorApp: ph.String({ required: true }),
        },
      }),
      description:
        "Attach the processor to a drive app by name. The processor will run in the context of that app.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeProcessorApp: global({
      input: ph.input({
        fields: {
          processorApp: ph.String({ required: true }),
        },
      }),
      description:
        "Detach the processor from a drive app by name. No-op if the app is not currently attached.",
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setProcessorStatus: global({
      input: ph.input({
        fields: {
          status: ph.ref(StatusType, { required: true }),
        },
      }),
      description:
        "Move the processor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
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
      "module/baseOperations": "91ad39c1-4e8b-4127-b3c8-e835b85e6360",
      "operation/baseOperations/setProcessorName":
        "6f3a5c90-39f2-4302-a073-6195a71c5054",
      "operation/baseOperations/setProcessorType":
        "b8f28bb4-c6ae-40e6-86fa-29ef14ff8667",
      "operation/baseOperations/addDocumentType":
        "fbbd7a71-c495-4efc-b8f6-1e57798dbbb4",
      "operation/baseOperations/removeDocumentType":
        "544d413f-423c-4d97-9570-84a19bffeab9",
      "operation/baseOperations/addProcessorApp":
        "df5eb500-7308-498c-9b80-028878ee198b",
      "operation/baseOperations/removeProcessorApp":
        "07e4168f-1a7b-41ef-953d-219028be7bb9",
      "operation/baseOperations/setProcessorStatus":
        "7b6706eb-5e25-4d64-829a-e3a251380fd1",
    },
    names: {
      "module/baseOperations": { storedName: "base_operations" },
      "operation/baseOperations/setProcessorName": {
        storedName: "SET_PROCESSOR_NAME",
      },
      "operation/baseOperations/setProcessorType": {
        storedName: "SET_PROCESSOR_TYPE",
      },
      "operation/baseOperations/addDocumentType": {
        storedName: "ADD_DOCUMENT_TYPE",
      },
      "operation/baseOperations/removeDocumentType": {
        storedName: "REMOVE_DOCUMENT_TYPE",
      },
      "operation/baseOperations/addProcessorApp": {
        storedName: "ADD_PROCESSOR_APP",
      },
      "operation/baseOperations/removeProcessorApp": {
        storedName: "REMOVE_PROCESSOR_APP",
      },
      "operation/baseOperations/setProcessorStatus": {
        storedName: "SET_PROCESSOR_STATUS",
      },
    },
    serialization: {
      "state/global/schema":
        '"""\nConfiguration for a processor contributed by the package. A processor receives\noperations from documents of matching types and runs server-side logic (e.g.\nbuilding a read model, indexing, syncing to an external system).\n"""\ntype ProcessorModuleState {\n  """Display name of the processor. Also determines the generated folder name under `processors/`."""\n  name: String!\n  """Processor implementation kind (e.g. \'read-model\', \'relational-db\'). Determines which scaffold codegen emits."""\n  type: String!\n  """Document types this processor subscribes to. Each entry has a stable id so it can be removed individually."""\n  documentTypes: [DocumentTypeItem!]!\n  """Lifecycle status. While DRAFT the processor definition is editable and codegen is skipped; switching to CONFIRMED triggers scaffold generation."""\n  status: StatusType!\n  """Drive-app names this processor is attached to. The processor runs in the context of each listed app."""\n  processorApps: [String!]!\n}\n\n"""A document type id (e.g. \'my-org/invoice\') attached to the processor with a stable entry id."""\ntype DocumentTypeItem {\n  """Stable identifier for the entry; used to remove it."""\n  id: OID!\n  """Document type id this processor subscribes to."""\n  documentType: String!\n}\n\n"""\nLifecycle status of a module definition.\n- DRAFT: still being edited; codegen does not run.\n- CONFIRMED: locked in; codegen produces the corresponding scaffold.\n"""\nenum StatusType {\n  DRAFT\n  CONFIRMED\n}',
      "state/global/initialValue":
        '{\n  "name": "",\n  "type": "",\n  "documentTypes": [],\n  "status": "DRAFT",\n "processorApps": []\n}',
      "state/local/initialValue": "",
      "operation/baseOperations/setProcessorName/schema":
        "input SetProcessorNameInput {\n  name: String!\n}",
      "operation/baseOperations/setProcessorType/schema":
        "input SetProcessorTypeInput {\n  type: String!\n}",
      "operation/baseOperations/addDocumentType/schema":
        "input AddDocumentTypeInput {\n  id: OID!\n  documentType: String!\n}",
      "operation/baseOperations/removeDocumentType/schema":
        "input RemoveDocumentTypeInput {\n  id: OID!\n}",
      "operation/baseOperations/addProcessorApp/schema":
        "input AddProcessorAppInput {\n  processorApp: String!\n}",
      "operation/baseOperations/removeProcessorApp/schema":
        "input RemoveProcessorAppInput {\n  processorApp: String!\n}",
      "operation/baseOperations/setProcessorStatus/schema":
        "input SetProcessorStatusInput {\n  status: StatusType!\n}",
    },
  }),
});

export const modules = [DefinitionV1];
