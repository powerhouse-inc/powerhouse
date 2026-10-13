import type {
  DocumentModelGlobalState,
  DocumentModelPHState,
} from "@powerhousedao/shared/document-model";
import {
  createState,
  defaultBaseState,
} from "@powerhousedao/shared/document-model";
import { schemaFirstSpecification } from "../../../src/definition/compatibility.js";
import { ph } from "../../../src/definition/field.js";
import { defineDocumentModel } from "../../../src/definition/model.js";
import { schemaFirstGraphQLDocument } from "../../../src/definition/tooling/graphql-document.js";

const MODULE_ID = "1f6e5a73-5a1f-4f6e-8a1f-6e5a735a1f6e";
const OPERATION_ID = "2a7f6b84-6b2a-4a7f-9b2a-7f6b846b2a7f";

const STATE_SCHEMA = [
  "enum ExtensionsStatus {",
  "  OPEN",
  "}",
  "",
  "extend enum ExtensionsStatus {",
  "  CLOSED",
  "}",
  "",
  "type ExtensionsState {",
  "  title: String!",
  "  status: ExtensionsStatus!",
  "}",
  "",
  "extend type ExtensionsState {",
  "  note: String",
  "}",
].join("\n");

const OPERATION_SCHEMA = [
  "input SetStatusInput {",
  "  status: ExtensionsStatus!",
  "}",
  "",
  "extend input SetStatusInput {",
  "  reason: String",
  "}",
  "",
  "extend type ExtensionsState {",
  "  flagged: Boolean",
  "}",
].join("\n");

const INITIAL_VALUE = '{"title":"","status":"OPEN","note":null,"flagged":null}';

const global: DocumentModelGlobalState = {
  id: "test/extensions",
  name: "Extensions",
  description: "A model whose stored SDL extends its types.",
  extension: "extensions",
  author: { name: "Powerhouse", website: null },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema: STATE_SCHEMA,
          initialValue: INITIAL_VALUE,
          examples: [],
        },
        local: { schema: "", initialValue: "", examples: [] },
      },
      modules: [
        {
          id: MODULE_ID,
          name: "statuses",
          description: "",
          operations: [
            {
              id: OPERATION_ID,
              name: "SET_STATUS",
              description: "",
              schema: OPERATION_SCHEMA,
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

export const extensionsStoredState: DocumentModelPHState = createState(
  defaultBaseState(),
  global,
);

const ExtensionsStatus = ph.enum("ExtensionsStatus", {
  values: ["OPEN", "CLOSED"],
});

const context = defineDocumentModel({
  id: "test/extensions",
  name: "Extensions",
  description: "A model whose stored SDL extends its types.",
  extension: "extensions",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    graphQLCompatibility: schemaFirstGraphQLDocument([
      STATE_SCHEMA,
      OPERATION_SCHEMA,
    ]),
    global: {
      schema: ph.object("ExtensionsState", {
        fields: {
          title: ph.String({ required: true }),
          status: ph.ref(ExtensionsStatus, { required: true }),
          note: ph.String(),
          flagged: ph.Boolean(),
        },
      }),
      initialValue: { title: "", status: "OPEN", note: null, flagged: null },
    },
    local: { schema: null, initialValue: {} },
  },
});

const statuses = context.module("statuses", {
  description: "",
  operations: ({ global: globalOperation }) => ({
    setStatus: globalOperation({
      input: ph.input({
        fields: {
          status: ph.ref(ExtensionsStatus, { required: true }),
          reason: ph.String(),
        },
      }),
      description: "",
      template: "",
      reducerTemplate: "",
      reduce(state, input) {
        state.status = input.status;
      },
    }),
  }),
});

export const DefinitionV1 = context.finalize({
  modules: [statuses],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/statuses": MODULE_ID,
      "operation/statuses/setStatus": OPERATION_ID,
    },
    names: {
      "module/statuses": { storedName: "statuses" },
      "operation/statuses/setStatus": { storedName: "SET_STATUS" },
    },
    serialization: {
      "state/global/schema": STATE_SCHEMA,
      "state/global/initialValue": INITIAL_VALUE,
      "state/local/initialValue": "",
      "operation/statuses/setStatus/schema": OPERATION_SCHEMA,
    },
  }),
});

export const modules = [DefinitionV1];
