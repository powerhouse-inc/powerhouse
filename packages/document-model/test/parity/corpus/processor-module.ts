import {
  defineDocumentModel,
  materialize,
  ph,
} from "../../../src/definition/index.js";

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

const ProcessorModuleState = ph.object("ProcessorModuleState", {
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
        "Processor implementation kind: `analytics` or `relational`. Determines which scaffold codegen emits; codegen generates nothing for any other value.",
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
});

const context = defineDocumentModel({
  id: "powerhouse/processor",
  name: "Processor Module",
  description:
    "Declares a processor (a server-side function that reacts to document operations to build read models, send notifications, sync to external systems, etc.) shipped by a Vetra Reactor Package. Create one Processor Module document per processor: pick the processor type, list the document types it subscribes to, attach it to any drive apps that should run it, and mark it CONFIRMED to trigger codegen of the processor scaffold under `processors/`.",
  extension: ".processor",
  version: 1,
  author: { name: "Powerhouse", website: "https://powerhouse.inc" },
  scopes: {
    global: {
      schema: ProcessorModuleState,
      initialValue: {
        name: "",
        type: "",
        documentTypes: [],
        status: "DRAFT",
        processorApps: [],
      },
    },
    local: { schema: null, initialValue: {} },
  },
});

const baseOperations = context.module("baseOperations", {
  description:
    "Set the processor's identity, kind, lifecycle status, subscribed document types, and attached drive apps.",
  operations: ({ global }) => ({
    setProcessorName: global({
      description:
        "Set the display name of the processor. Also determines the generated folder name under `processors/`.",
      input: ph.input({
        fields: {
          name: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setProcessorType: global({
      description:
        "Set the processor implementation kind: `analytics` or `relational`. Determines which scaffold codegen emits. Any other value is rejected with UnsupportedProcessorTypeError.",
      input: ph.input({
        fields: {
          type: ph.String({ required: true }),
        },
      }),
      errors: {
        UnsupportedProcessorTypeError: {
          code: "UNSUPPORTED_PROCESSOR_TYPE",
          name: "UnsupportedProcessorTypeError",
          description:
            "The processor type is not `analytics` or `relational`, the kinds codegen can generate.",
          template: "",
        },
      },
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addDocumentType: global({
      description:
        "Subscribe the processor to a document type. Caller supplies a stable id so the entry can be removed later.",
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
          documentType: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeDocumentType: global({
      description:
        "Unsubscribe the processor from a document type by removing its entry id.",
      input: ph.input({
        fields: {
          id: ph.OID({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    addProcessorApp: global({
      description:
        "Attach the processor to a drive app by name. The processor will run in the context of that app.",
      input: ph.input({
        fields: {
          processorApp: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    removeProcessorApp: global({
      description:
        "Detach the processor from a drive app by name. No-op if the app is not currently attached.",
      input: ph.input({
        fields: {
          processorApp: ph.String({ required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
    setProcessorStatus: global({
      description:
        "Move the processor between DRAFT and CONFIRMED. Codegen only runs once the status is CONFIRMED.",
      input: ph.input({
        fields: {
          status: ph.ref(StatusType, { required: true }),
        },
      }),
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const processorModule = materialize(
  context.version({ modules: [baseOperations] }),
);
