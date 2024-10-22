import { reducer, utils } from "document-model/document-model";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";
const mockDocument = {
  name: "test",
  documentType: "powerhouse/document-model",
  revision: {
    global: 7,
    local: 0,
  },
  created: "2024-10-22T11:19:59.853Z",
  lastModified: "2021-03-10T08:00:00.000Z",
  attachments: {},
  state: {
    global: {
      id: "",
      name: "test",
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
              schema: "type State {\n  examples: [String!]!\n}",
              initialValue: '{"examples":[]}',
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
              id: "f3CeDMmurFaSVu+hg6ONVrXU/Nk=",
              name: "test_module",
              description: "",
              operations: [
                {
                  id: "EFtArGEP3/5wFaA2kDMyFszz51Q=",
                  name: "CREATE_SOMETHING",
                  description: "",
                  schema: "input CreateSomethingInput {\n  value: String\n}",
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
    created: "2024-10-22T11:19:59.853Z",
    lastModified: "2024-10-22T11:19:59.853Z",
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
        id: "90cd28fc-7567-4e6b-aeb2-7677c651c7e1",
        index: 0,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "nWKpqR6ns0l8C/Khwrl+SyKy0sA=",
        skip: 0,
      },
      {
        type: "SET_NAME",
        input: "test",
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
        id: "094dd47f-54b3-407a-bcbe-362a8bf26775",
        index: 1,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "nWKpqR6ns0l8C/Khwrl+SyKy0sA=",
        skip: 0,
      },
      {
        type: "ADD_MODULE",
        input: {
          id: "f3CeDMmurFaSVu+hg6ONVrXU/Nk=",
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
        id: "0235eece-643c-412f-88a1-e3b3f3233759",
        index: 2,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "h9lyeag6v49lPxfJVy8l70QA0Os=",
        skip: 0,
      },
      {
        type: "ADD_OPERATION",
        input: {
          id: "EFtArGEP3/5wFaA2kDMyFszz51Q=",
          moduleId: "f3CeDMmurFaSVu+hg6ONVrXU/Nk=",
          name: "CREATE_SOMETHING",
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
        id: "b6ac01d8-5cc9-43c0-a34d-841cf5b3b85d",
        index: 3,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "LkU56YncOQZeWIVfjDciOJym7Uw=",
        skip: 0,
      },
      {
        type: "SET_STATE_SCHEMA",
        input: {
          schema: "type State {\n  examples: [String!]!\n}",
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
        id: "e2367697-f6ec-4add-9eac-6237c865bbf5",
        index: 4,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "k5wNJYsRu+wwAGyoMgpbcH8nsWs=",
        skip: 0,
      },
      {
        type: "SET_INITIAL_STATE",
        input: {
          initialValue: '{"examples":[]}',
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
        id: "4bb184bc-12fa-4463-a93c-8804e567972f",
        index: 5,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "NXG7xiEhYPEzttJWqDhjcSTWxys=",
        skip: 0,
      },
      {
        type: "SET_OPERATION_SCHEMA",
        input: {
          id: "EFtArGEP3/5wFaA2kDMyFszz51Q=",
          schema: "input CreateSomethingInput {\n  value: String\n}",
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
        id: "731526f1-7c13-41c0-9d9a-f9d9613df965",
        index: 6,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "cOIKCL0VwdxNt9Kgpv5EKI+PKD0=",
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
