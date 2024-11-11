import { reducer, utils } from "document-model/document-model";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";

const mockDocument = {
  name: "",
  documentType: "powerhouse/document-model",
  revision: {
    global: 1,
    local: 0,
  },
  created: "2024-10-31T13:42:20.087Z",
  lastModified: "2021-03-10T08:00:00.000Z",
  attachments: {},
  state: {
    global: {
      id: "test",
      name: "test",
      extension: "test",
      description: "test",
      author: {
        name: "test",
        website: "test",
      },
      specifications: [
        {
          version: 1,
          changeLog: [],
          state: {
            global: {
              schema:
                'type TestState {\n  "Add your global state fields here"\n  _placeholder: Date\n}',
              initialValue: '{\n  "_placeholder": ""\n}',
              examples: [],
            },
            local: {
              schema: "",
              initialValue: "",
              examples: [],
            },
          },
          modules: [
            {
              id: "bfLMn+wvzvc0mxTVyQTgL9ZxKS8=",
              name: "test",
              description: "",
              operations: [
                {
                  id: "5Zj6YgYHe0jYMdI7Z31jIQqgJ0k=",
                  name: "TEST",
                  description: "",
                  schema:
                    'input TestInput {\n  "Add your inputs here"\n  _placeholder: String\n}',
                  template: "",
                  reducer: "",
                  errors: [],
                  examples: [],
                  scope: "global",
                },
                {
                  id: "6hg/LYVUDrmiTweY70Ikqzhyyac=",
                  name: "TEST2",
                  description: "",
                  schema:
                    'input Test2Input {\n  "Add your inputs here"\n  _placeholder: String\n}',
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
  initialState: {
    name: "",
    documentType: "powerhouse/document-model",
    revision: {
      global: 15,
      local: 0,
    },
    created: "2024-10-31T13:42:20.087Z",
    lastModified: "2021-03-10T08:00:00.000Z",
    attachments: {},
    state: {
      global: {
        id: "",
        name: "test",
        extension: "test",
        description: "test",
        author: {
          name: "test",
          website: "test",
        },
        specifications: [
          {
            version: 1,
            changeLog: [],
            state: {
              global: {
                schema:
                  'type TestState {\n  "Add your global state fields here"\n  _placeholder: String\n}',
                initialValue: '{\n  "_placeholder": ""\n}',
                examples: [],
              },
              local: {
                schema: "",
                initialValue: "",
                examples: [],
              },
            },
            modules: [
              {
                id: "bfLMn+wvzvc0mxTVyQTgL9ZxKS8=",
                name: "test",
                description: "",
                operations: [
                  {
                    id: "5Zj6YgYHe0jYMdI7Z31jIQqgJ0k=",
                    name: "TEST",
                    description: "",
                    schema:
                      'input TestInput {\n  "Add your inputs here"\n  _placeholder: String\n}',
                    template: "",
                    reducer: "",
                    errors: [],
                    examples: [],
                    scope: "global",
                  },
                  {
                    id: "6hg/LYVUDrmiTweY70Ikqzhyyac=",
                    name: "TEST2",
                    description: "",
                    schema:
                      'input Test2Input {\n  "Add your inputs here"\n  _placeholder: String\n}',
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
    initialState: {
      name: "",
      documentType: "powerhouse/document-model",
      revision: {
        global: 0,
        local: 0,
      },
      created: "2024-10-31T13:42:20.087Z",
      lastModified: "2024-10-31T13:42:20.087Z",
      attachments: {},
      state: {
        global: {
          id: "",
          name: "",
          extension: "",
          description: "",
          author: {
            name: "",
            website: "",
          },
          specifications: [
            {
              version: 1,
              changeLog: [],
              state: {
                global: {
                  schema: "",
                  initialValue: "",
                  examples: [],
                },
                local: {
                  schema: "",
                  initialValue: "",
                  examples: [],
                },
              },
              modules: [],
            },
          ],
        },
        local: {},
      },
    },
    operations: {
      global: [
        {
          type: "SET_MODEL_NAME",
          input: {
            name: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "565bf6a2-c3f7-4d02-89bc-bcc163b77e10",
          index: 0,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "nWKpqR6ns0l8C/Khwrl+SyKy0sA=",
          skip: 0,
        },
        {
          type: "SET_STATE_SCHEMA",
          input: {
            schema:
              'type TestState {\n  "Add your global state fields here"\n  _placeholder: String\n}',
            scope: "global",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "c8d54adc-e98f-4c13-b5e3-f5498244fa6a",
          index: 1,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "tDBPBfLKrIUXwX+ZmOgmVeGFwsk=",
          skip: 0,
        },
        {
          type: "SET_INITIAL_STATE",
          input: {
            initialValue: "{}",
            scope: "global",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "7561c595-03c7-4bd1-af72-d589de6b2661",
          index: 2,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "90892WFBxerKE1USJLrGNA/91l4=",
          skip: 0,
        },
        {
          type: "SET_MODEL_ID",
          input: {
            id: "",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "58b40fb2-210d-43fb-9cb2-2ce1a8eb5ed1",
          index: 3,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "90892WFBxerKE1USJLrGNA/91l4=",
          skip: 0,
        },
        {
          type: "SET_MODEL_DESCRIPTION",
          input: {
            description: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "f0a23eee-13b1-4092-9457-cc14ab6e68a3",
          index: 4,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "g4PeQtPSreU0eQXlZ9PtqvC/u6Q=",
          skip: 0,
        },
        {
          type: "SET_AUTHOR_NAME",
          input: {
            authorName: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "4722fe83-fe36-4cfe-a999-0982502e8a0a",
          index: 5,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "OkEF2jxDfjNiqKJIBmNdJDIgJ0s=",
          skip: 0,
        },
        {
          type: "SET_AUTHOR_NAME",
          input: {
            authorName: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "09858a97-e840-44e3-bdff-3301a2a383e5",
          index: 6,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "OkEF2jxDfjNiqKJIBmNdJDIgJ0s=",
          skip: 0,
        },
        {
          type: "SET_AUTHOR_WEBSITE",
          input: {
            authorWebsite: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "e3f579d8-2635-40fb-b214-94a7eb8b6f47",
          index: 7,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "/Wd+mzjC5LEwKjAOXZivuEcT2Vg=",
          skip: 0,
        },
        {
          type: "SET_MODEL_EXTENSION",
          input: {
            extension: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "5d656319-fbda-4f09-9b2a-edc645a455c7",
          index: 8,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "QR9iIqGRBfS7WihbQvOzDMSaPXU=",
          skip: 0,
        },
        {
          type: "SET_INITIAL_STATE",
          input: {
            initialValue: '{\n  "_placeholder": ""\n}',
            scope: "global",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "97cbdb82-c191-4553-a75c-a041c9dec2ba",
          index: 9,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "r6Ts8B1YDgw7ntGUcv41SgklZ+0=",
          skip: 0,
        },
        {
          type: "ADD_MODULE",
          input: {
            id: "bfLMn+wvzvc0mxTVyQTgL9ZxKS8=",
            name: "test",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "ef725ddc-df62-4a33-99d0-64d67bc4aaf2",
          index: 10,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "tuX7faLo8jf1xMTCxs6/KAZ3OBY=",
          skip: 0,
        },
        {
          type: "ADD_OPERATION",
          input: {
            id: "5Zj6YgYHe0jYMdI7Z31jIQqgJ0k=",
            moduleId: "bfLMn+wvzvc0mxTVyQTgL9ZxKS8=",
            name: "TEST",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "5a372ebd-d530-4d98-867f-adbdaed32c2a",
          index: 11,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "OB+EEG6wCRNUW0r11npMvT/+AUs=",
          skip: 0,
        },
        {
          type: "SET_OPERATION_SCHEMA",
          input: {
            id: "5Zj6YgYHe0jYMdI7Z31jIQqgJ0k=",
            schema:
              'input TestInput {\n  "Add your inputs here"\n  _placeholder: String\n}',
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "9455f84f-cfd1-4209-9bcb-e110e6a21a38",
          index: 12,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "fqp+Scdz5AYL6fDnjgkFYhwvXUc=",
          skip: 0,
        },
        {
          type: "ADD_OPERATION",
          input: {
            id: "6hg/LYVUDrmiTweY70Ikqzhyyac=",
            moduleId: "bfLMn+wvzvc0mxTVyQTgL9ZxKS8=",
            name: "TEST2",
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "a80b2fa8-8e26-45a2-be1c-2a2faeaa552d",
          index: 13,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "D0LCAbQwYPTGUNM+pnOUzOrXjXE=",
          skip: 0,
        },
        {
          type: "SET_OPERATION_SCHEMA",
          input: {
            id: "6hg/LYVUDrmiTweY70Ikqzhyyac=",
            schema:
              'input Test2Input {\n  "Add your inputs here"\n  _placeholder: String\n}',
          },
          scope: "global",
          context: {
            signer: {
              user: {
                address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
                networkId: "eip155",
                chainId: 1,
              },
              app: {
                name: "storybook",
                key: "storybook",
              },
              signatures: [],
            },
          },
          id: "07da64ee-5473-43bc-92df-648b586047a9",
          index: 14,
          timestamp: "2021-03-10T08:00:00.000Z",
          hash: "AbMZuSXvtZpHqFt5WWowA3EfL64=",
          skip: 0,
        },
      ],
      local: [],
    },
    clipboard: [],
  },
  operations: {
    global: [
      {
        type: "SET_MODEL_ID",
        input: {
          id: "test",
        },
        scope: "global",
        context: {
          signer: {
            user: {
              address: "0xd8da6bf26964af9d7eed9e03e53415d37aa96045",
              networkId: "eip155",
              chainId: 1,
            },
            app: {
              name: "storybook",
              key: "storybook",
            },
            signatures: [],
          },
        },
        id: "f7046e8e-0180-41c8-8623-6ba47b4736b0",
        index: 0,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "KtY6y48NRPDCpRMnpHDqv1Qhp3E=",
        skip: 0,
      },
    ],
    local: [],
  },
  clipboard: [],
};

const { meta, CreateDocumentStory: DocumentModel2 } = createDocumentStory(
  Editor,
  reducer,
  // mockDocument,
  utils.createExtendedState(),
);

export default { ...meta, title: "Document Model 2" };

export { DocumentModel2 };
