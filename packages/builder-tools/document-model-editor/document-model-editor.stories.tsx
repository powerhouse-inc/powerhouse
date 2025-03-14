import { createDocumentStory } from "#editor-utils/storybook";
import { type Meta } from "@storybook/react";
import {
  documentModelCreateExtendedState,
  documentModelReducer,
} from "document-model";
import { v7 as uuidv7 } from "uuid";
import { DocumentModelEditor } from "./editor.js";

const { meta, CreateDocumentStory: Empty } = createDocumentStory(
  DocumentModelEditor,
  documentModelReducer,
  documentModelCreateExtendedState(),
);

const { CreateDocumentStory: WithData } = createDocumentStory(
  DocumentModelEditor,
  documentModelReducer,
  documentModelCreateExtendedState({
    state: {
      global: {
        id: "test type",
        name: "test",
        extension: ".test.ph",
        description: "test description",
        author: {
          name: "test user",
          website: "https://test.com",
        },
        specifications: [
          {
            version: 1,
            changeLog: [],
            state: {
              global: {
                schema:
                  'type TestState {\n  "Add your global state fields here"\n  _placeholder: String\n  something: Int\n  another: Boolean\n}',
                initialValue:
                  '{\n  "_placeholder": "",\n  "something": 0,\n  "another": false\n}',
                examples: [],
              },
              local: {
                schema:
                  'type TestLocalState {\n  "Add your local state fields here"\n  _placeholder: String\n  test: String\n  another: Int\n}',
                initialValue:
                  '{\n  "_placeholder": "",\n  "test": "",\n  "another": 0\n}',
                examples: [],
              },
            },
            modules: [
              {
                id: "TuKeTdrcoKwzZe0ZJQCrWLr4pGw=",
                name: "test_module",
                description: "",
                operations: [
                  {
                    id: "NEYEmynbmVnx5ZlESaoVx18pl38=",
                    name: "TEST_OPERATION",
                    description: "test operation description",
                    schema:
                      'input TestOperationInput {\n  "Add your inputs here"\n  _placeholder: String\n  test: TestInput\n}\n\ninput TestInput {\n  test: String\n}',
                    template: "",
                    reducer: "",
                    errors: [
                      {
                        id: "FwZyM4KAxRO+GurVuSRxgaENKSk=",
                        name: "TestException",
                        code: "",
                        description: "",
                        template: "",
                      },
                    ],
                    examples: [],
                    scope: "global",
                  },
                ],
              },
              {
                id: "Uix/waNZU0L0Q6bryt7QFnf3aoA=",
                name: "another_test_module",
                description: "",
                operations: [
                  {
                    id: "iDXCKGVaDPPCyTVxv8vQ2h7SVvw=",
                    name: "ANOTHER_TEST_OPERATION",
                    description: "another description",
                    schema:
                      'input AnotherTestOperationInput {\n  "Add your inputs here"\n  _placeholder: String\n  test: Int\n}',
                    template: "",
                    reducer: "",
                    errors: [],
                    examples: [],
                    scope: "global",
                  },
                  {
                    id: "N2Flem5MW4dnLd0y21si2J0ZA9E=",
                    name: "ONE_MORE_OPERATION",
                    description: "one more description",
                    schema:
                      'input OneMoreOperationInput {\n  "Add your inputs here"\n  _placeholder: String\n}',
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
      },
      local: {},
    },
  }),
);

const { CreateDocumentStory: WithBackgroundUpdates } = createDocumentStory(
  DocumentModelEditor,
  documentModelReducer,
  documentModelCreateExtendedState({
    state: {
      global: {
        id: "test type",
        name: "test",
        extension: ".test.ph",
        description: "test description",
        author: {
          name: "test user",
          website: "https://test.com",
        },
        specifications: [
          {
            version: 1,
            changeLog: [],
            state: {
              global: {
                schema:
                  'type TestState {\n  "Add your global state fields here"\n  _placeholder: String\n  something: Int\n  another: Boolean\n}',
                initialValue:
                  '{\n  "_placeholder": "",\n  "something": 0,\n  "another": false\n}',
                examples: [],
              },
              local: {
                schema:
                  'type TestLocalState {\n  "Add your local state fields here"\n  _placeholder: String\n  test: String\n  another: Int\n}',
                initialValue:
                  '{\n  "_placeholder": "",\n  "test": "",\n  "another": 0\n}',
                examples: [],
              },
            },
            modules: [
              {
                id: "TuKeTdrcoKwzZe0ZJQCrWLr4pGw=",
                name: "test_module",
                description: "",
                operations: [
                  {
                    id: "NEYEmynbmVnx5ZlESaoVx18pl38=",
                    name: "TEST_OPERATION",
                    description: "test operation description",
                    schema:
                      'input TestOperationInput {\n  "Add your inputs here"\n  _placeholder: String\n  test: TestInput\n}\n\ninput TestInput {\n  test: String\n}',
                    template: "",
                    reducer: "",
                    errors: [
                      {
                        id: "FwZyM4KAxRO+GurVuSRxgaENKSk=",
                        name: "TestException",
                        code: "",
                        description: "",
                        template: "",
                      },
                    ],
                    examples: [],
                    scope: "global",
                  },
                ],
              },
              {
                id: "Uix/waNZU0L0Q6bryt7QFnf3aoA=",
                name: "another_test_module",
                description: "",
                operations: [
                  {
                    id: "iDXCKGVaDPPCyTVxv8vQ2h7SVvw=",
                    name: "ANOTHER_TEST_OPERATION",
                    description: "another description",
                    schema:
                      'input AnotherTestOperationInput {\n  "Add your inputs here"\n  _placeholder: String\n  test: Int\n}',
                    template: "",
                    reducer: "",
                    errors: [],
                    examples: [],
                    scope: "global",
                  },
                  {
                    id: "N2Flem5MW4dnLd0y21si2J0ZA9E=",
                    name: "ONE_MORE_OPERATION",
                    description: "one more description",
                    schema:
                      'input OneMoreOperationInput {\n  "Add your inputs here"\n  _placeholder: String\n}',
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
      },
      local: {},
    },
  }),
  {
    simulateBackgroundUpdates: {
      backgroundUpdateRate: 1000,
      backgroundUpdateActions: [
        (document) => {
          const id = uuidv7().split("-").at(-1);
          const oldStateSchema =
            document.state.global.specifications[0].state.global.schema;
          const newTypeDef = `
type TestDefinition${id} {
  test: String
}`;

          const newStateSchema = `${oldStateSchema}\n${newTypeDef}`;

          return {
            type: "SET_STATE_SCHEMA" as const,
            input: {
              schema: newStateSchema,
              scope: "global",
            },
            scope: "global",
          };
        },
        (document) => {
          const id = uuidv7().split("-").at(-1);
          const oldStateSchema =
            document.state.global.specifications[0].state.local.schema;
          const newTypeDef = `
type TestLocalDefinition${id} {
  test: String
}`;

          const newStateSchema = `${oldStateSchema}\n${newTypeDef}`;

          return {
            type: "SET_STATE_SCHEMA" as const,
            input: {
              schema: newStateSchema,
              scope: "local",
            },
            scope: "global",
          };
        },
        (document) => {
          const moduleIndex =
            document.state.global.specifications[0].modules.length + 1;

          return {
            type: "ADD_MODULE" as const,
            input: {
              id: uuidv7(),
              name: `test_module_${moduleIndex}`,
            },
            scope: "global",
          };
        },
        (document) => {
          const modules = document.state.global.specifications[0].modules;
          const module = modules[0];
          const operationIndex = module.operations.length + 1;

          return {
            type: "ADD_OPERATION" as const,
            input: {
              id: uuidv7(),
              name: `test_operation_${operationIndex}`,
              moduleId: module.id,
            },
            scope: "global",
          };
        },
      ],
    },
  },
);

export default { ...meta, title: "Document Model 2" } as Meta<
  typeof DocumentModelEditor
>;

export { Empty, WithBackgroundUpdates, WithData };
