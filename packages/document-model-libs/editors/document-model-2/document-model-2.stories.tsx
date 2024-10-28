import { reducer, utils } from "document-model/document-model";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";

const mockDocument = {
  name: "test",
  documentType: "powerhouse/document-model",
  revision: {
    global: 3,
    local: 0,
  },
  created: "2024-10-28T09:33:47.282Z",
  lastModified: "2021-03-10T08:00:00.000Z",
  attachments: {},
  state: {
    global: {
      id: "",
      name: "test",
      extension: ".test.ph",
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
  initialState: {
    name: "",
    documentType: "powerhouse/document-model",
    revision: {
      global: 0,
      local: 0,
    },
    created: "2024-10-28T09:33:47.282Z",
    lastModified: "2024-10-28T09:33:47.282Z",
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
        id: "984c3a8d-0779-4613-a806-7e59e4adb8e7",
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
        id: "9b7bc444-6308-4566-8fd9-6474d02fd592",
        index: 1,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "nWKpqR6ns0l8C/Khwrl+SyKy0sA=",
        skip: 0,
      },
      {
        type: "SET_MODEL_EXTENSION",
        input: {
          extension: ".test.ph",
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
        id: "5e88e12c-380c-471a-a961-79fc49cd3065",
        index: 2,
        timestamp: "2021-03-10T08:00:00.000Z",
        hash: "8nMiCxVFnYGv30xXM0tusiEYcic=",
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
