/**
 * The corpus root the repository does not have: a model with state and
 * operation examples, and a scalar reached only from an operation input.
 *
 * Every shipped model has zero examples, so without this root the example
 * assertions iterate empty arrays and prove nothing. Its schema-first half
 * is a stored specification written the way the model editor stores one —
 * hand-formatted, opaque IDs, `""` metadata — and its code-first half keys
 * each example by `schema-first-id:<stored id>`, which is the convention the
 * adapter derives.
 */
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

const MODULE_ID = "5a1f0c2e-0b5a-4a1e-9f5a-1c2e0b5a4a1e";
const OPERATION_ID = "6b2f1d3f-1c6b-4b2f-8a6b-2d3f1c6b4b2f";
const ERROR_ID = "7c3a2e40-2d7c-4c3a-9b7c-3e402d7c4c3a";
const STATE_EXAMPLE_ID = "8d4b3f51-3e8d-4d4b-8c8d-4f513e8d4d4b";
const OPERATION_EXAMPLE_ID = "9e5c4062-4f9e-4e5c-9d9e-50624f9e4e5c";

const STATE_SCHEMA =
  "type SampleState {\n    label: OLabel\n    entries: [String!]!\n}";
const OPERATION_SCHEMA =
  "input AddEntryInput {\n    entry: String!\n    at: DateTime\n}";

const global: DocumentModelGlobalState = {
  id: "test/sample",
  name: "Sample",
  description: "A model with examples.",
  extension: "sample",
  author: { name: "Powerhouse", website: null },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema: STATE_SCHEMA,
          initialValue: '{"label":null,"entries":[]}',
          examples: [{ id: STATE_EXAMPLE_ID, value: '{"entries":["one"]}' }],
        },
        local: { schema: "", initialValue: "", examples: [] },
      },
      modules: [
        {
          id: MODULE_ID,
          name: "entries",
          description: "",
          operations: [
            {
              id: OPERATION_ID,
              name: "ADD_ENTRY",
              description: "",
              schema: OPERATION_SCHEMA,
              template: "",
              reducer: "",
              errors: [
                {
                  id: ERROR_ID,
                  code: "ENTRY_TOO_LONG",
                  name: "EntryTooLong",
                  description: "The entry exceeds the limit.",
                  template: null,
                },
              ],
              examples: [
                { id: OPERATION_EXAMPLE_ID, value: '{"entry":"one"}' },
              ],
              scope: "global",
            },
          ],
        },
      ],
    },
  ],
};

export const sampleStoredState: DocumentModelPHState = createState(
  defaultBaseState(),
  global,
);

const context = defineDocumentModel({
  id: "test/sample",
  name: "Sample",
  description: "A model with examples.",
  extension: "sample",
  version: 1,
  author: { name: "Powerhouse", website: null },
  specifications: {
    global: {
      schema: ph.object("SampleState", {
        fields: {
          label: ph.OLabel(),
          entries: ph.list(ph.String({ required: true }), { required: true }),
        },
      }),
      initialValue: { label: null, entries: [] },
      examples: [
        {
          key: `schema-first-id:${STATE_EXAMPLE_ID}`,
          value: '{"entries":["one"]}',
        },
      ],
    },
    local: { schema: null, initialValue: {} },
  },
});

const entries = context.module("entries", {
  description: "",
  operations: ({ global: globalOperation }) => ({
    addEntry: globalOperation({
      input: ph.input({
        fields: {
          entry: ph.String({ required: true }),
          at: ph.DateTime(),
        },
      }),
      description: "",
      errors: {
        EntryTooLong: {
          code: "ENTRY_TOO_LONG",
          name: "EntryTooLong",
          description: "The entry exceeds the limit.",
        },
      },
      examples: [
        {
          key: `schema-first-id:${OPERATION_EXAMPLE_ID}`,
          value: '{"entry":"one"}',
        },
      ],
      template: "",
      reducerTemplate: "",
      reduce() {},
    }),
  }),
});

export const DefinitionV1 = context.finalize({
  modules: [entries],
  compatibility: schemaFirstSpecification({
    ids: {
      "module/entries": MODULE_ID,
      "operation/entries/addEntry": OPERATION_ID,
      "error/entries/addEntry/EntryTooLong": ERROR_ID,
      [`state-example/global/schema-first-id:${STATE_EXAMPLE_ID}`]:
        STATE_EXAMPLE_ID,
      [`operation-example/entries/addEntry/schema-first-id:${OPERATION_EXAMPLE_ID}`]:
        OPERATION_EXAMPLE_ID,
    },
    names: {
      "module/entries": { storedName: "entries" },
      "operation/entries/addEntry": { storedName: "ADD_ENTRY" },
    },
    serialization: {
      "state/global/schema": STATE_SCHEMA,
      "state/local/initialValue": "",
      "operation/entries/addEntry/schema": OPERATION_SCHEMA,
    },
  }),
});

export const modules = [DefinitionV1];
