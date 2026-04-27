import type { DocumentModelGlobalState } from "document-model";

export const documentModel: DocumentModelGlobalState = {
  author: {
    name: "Powerhouse",
    website: "https://powerhouse.inc",
  },
  description: "test description",
  extension: ".phdm",
  id: "powerhouse/test-doc",
  name: "test-doc",
  specifications: [
    {
      changeLog: [],
      modules: [
        {
          description: "",
          id: "1eb3fcc2-deac-4932-9cf1-077a9c915b64",
          name: "base_operations",
          operations: [
            {
              description: "",
              errors: [],
              examples: [],
              id: "c4b46f8b-0981-47f7-9bbc-86e998595c97",
              name: "SET_TEST_ID",
              reducer: "",
              schema: "input SetTestIdInput {\n  id: Int!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "def9d61b-c6d1-4d3b-89bd-65b22fc36bc6",
              name: "SET_TEST_NAME",
              reducer: "",
              schema: "input SetTestNameInput {\n  name: String!\n}",
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
            '{\n  "id": 0,\n  "name": "",\n  "description": null,\n  "value": ""\n}',
          schema:
            "type TestDocState {\n  id: Int!\n  name: String!\n  description: String\n  value: String!\n}",
        },
        local: {
          examples: [],
          initialValue: "",
          schema: "",
        },
      },
      version: 1,
    },
    {
      changeLog: [],
      modules: [
        {
          description: "",
          id: "1eb3fcc2-deac-4932-9cf1-077a9c915b64",
          name: "base_operations",
          operations: [
            {
              description: "",
              errors: [],
              examples: [],
              id: "c4b46f8b-0981-47f7-9bbc-86e998595c97",
              name: "SET_TEST_ID",
              reducer: "",
              schema: "input SetTestIdInput {\n  id: Int!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "c4b46f8b-0982-47f7-9bbc-87e996595c97",
              name: "SET_TEST_ID_BUT_DIFFERENT",
              reducer: "",
              schema: "input SetTestIdButDifferentInput {\n  id: String!\n}",
              template: "",
              scope: "global",
            },
            {
              description: "",
              errors: [],
              examples: [],
              id: "def9d61b-c6d1-4d3b-89bd-65b22fc36bc6",
              name: "SET_TEST_NAME",
              reducer: "",
              schema: "input SetTestNameInput {\n  name: String!\n}",
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
            '{\n  "id": 0,\n  "name": "",\n  "description": null,\n  "value": ""\n}',
          schema:
            "type TestDocState {\n  id: Int!\n  name: String!\n  description: String\n  value: String!\n}",
        },
        local: {
          examples: [],
          initialValue: "",
          schema: "",
        },
      },
      version: 2,
    },
  ],
};
