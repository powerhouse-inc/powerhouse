import {
  createDocumentStory,
  EditorStoryComponent,
} from "document-model-libs/utils";
import {
  RealWorldAssetsAction,
  RealWorldAssetsLocalState,
  RealWorldAssetsState,
  reducer,
  utils,
} from "../../document-models/real-world-assets";
import Editor from "./editor";
import {
  mockCashTransaction,
  mockStateInitial,
  mockStateWithData,
} from "../../document-models/real-world-assets/mock-data/initial-state";
import { v7 as uuidv7 } from "uuid";
import { Meta } from "@storybook/react";

const { meta, CreateDocumentStory: Empty } = createDocumentStory(
  Editor as EditorStoryComponent<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
  >,
  reducer,
  utils.createExtendedState({
    state: {
      global: mockStateInitial,
      local: {},
    },
  }),
  {
    isAllowedToCreateDocuments: true,
    isAllowedToEditDocuments: true,
  },
);

const { CreateDocumentStory: WithData } = createDocumentStory(
  Editor as EditorStoryComponent<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
  >,
  reducer,
  utils.createExtendedState({
    state: {
      global: mockStateWithData,
      local: {},
    },
  }),
  {
    isAllowedToCreateDocuments: true,
    isAllowedToEditDocuments: true,
  },
);

const { CreateDocumentStory: WithBackgroundUpdates } = createDocumentStory(
  Editor as EditorStoryComponent<
    RealWorldAssetsState,
    RealWorldAssetsAction,
    RealWorldAssetsLocalState
  >,
  reducer,
  utils.createExtendedState({
    state: {
      global: mockStateInitial,
      local: {},
    },
  }),
  {
    isAllowedToCreateDocuments: true,
    isAllowedToEditDocuments: true,
    simulateBackgroundUpdates: {
      backgroundUpdateRate: 1000,
      backgroundUpdateActions: [
        // general
        () => {
          const id = uuidv7();
          return {
            type: "CREATE_ACCOUNT" as const,
            input: {
              label: `Account ${id}`,
              reference: `0x${id}`,
              id,
            },
            scope: "global",
          };
        },
        () => {
          const id = uuidv7();
          return {
            type: "CREATE_SPV" as const,
            input: {
              name: `SPV ${id}`,
              id,
            },
            scope: "global",
          };
        },
        (document) => {
          const secondAccountInState = document.state.global.accounts[1];
          const id = uuidv7();
          return {
            type: "CREATE_SERVICE_PROVIDER_FEE_TYPE" as const,
            input: {
              name: `Service Provider Fee Type ${id}`,
              feeType: `Fee Type ${id}`,
              accountId: secondAccountInState.id,
              id,
            },
            scope: "global",
          };
        },
        // portfolio
        () => {
          const id = uuidv7();
          return {
            type: "CREATE_FIXED_INCOME_TYPE" as const,
            input: {
              name: `Fixed Income Type ${id}`,
              id,
            },
            scope: "global",
          };
        },
        (document) => {
          const firstFixedIncomeTypeInState =
            document.state.global.fixedIncomeTypes[0];
          const firstSpvInState = document.state.global.spvs[0];
          const id = uuidv7();
          return {
            type: "CREATE_FIXED_INCOME_ASSET" as const,
            input: {
              name: `Fixed Income Asset ${id}`,
              id,
              fixedIncomeTypeId: firstFixedIncomeTypeInState.id,
              spvId: firstSpvInState.id,
            },
            scope: "global",
          };
        },
        // transactions;
        (document) => {
          const id = uuidv7();
          const entryTime = new Date().toISOString();
          return {
            type: "CREATE_GROUP_TRANSACTION" as const,
            input: {
              name: `Group Transaction ${id}`,
              id,
              type: "PrincipalDraw" as const,
              entryTime,
              cashTransaction: {
                ...mockCashTransaction,
                counterPartyAccountId:
                  document.state.global.principalLenderAccountId,

                amount: 1000,
                assetId: document.state.global.portfolio[0].id,
                id,
                entryTime,
              },
            },
            scope: "global",
          };
        },
      ],
    },
  },
);

export default {
  ...meta,
  title: "Real World Assets",
} as Meta<typeof Editor>;

export { Empty, WithData, WithBackgroundUpdates };
