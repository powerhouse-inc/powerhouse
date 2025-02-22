import type { DocumentModelState } from "document-model/document-model";

export const documentModel: DocumentModelState = {
  id: "powerhouse/account-snapshot",
  name: "AccountSnapshot",
  extension: "phas",
  description: "",
  author: {
    name: "powerhouse",
    website: "https://powerhouse.inc/",
  },
  specifications: [
    {
      version: 1,
      changeLog: [],
      state: {
        global: {
          schema:
            "type AccountSnapshotState {\n\tid: ID!\n    ownerId: ID\n    ownerType: String\n    period: String\n    start: String\n    end: String\n    actualsComparison: [ActualsComparison]\n    snapshotAccount: [SnapshotAccount]\n}\n\ntype ActualsComparison {\n    currency: String\n    month: String\n    reportedActuals: Float\n    netExpenses: ActualsComparisonNetExpenses\n}\n\ntype ActualsComparisonNetExpenses {\n    offChainIncluded: ActualsComparisonNetExpensesItem\n    onChainOnly: ActualsComparisonNetExpensesItem!\n}\n\ntype ActualsComparisonNetExpensesItem {\n    amount: Float\n    difference: Float\n}\n\ntype SnapshotAccount {\n    accountAddress: String\n    accountLabel: String\n    accountType: String\n    groupAccountId: ID\n    id: ID!\n    offChain: Boolean\n    upstreamAccountId: ID\n    snapshotAccountBalance: [SnapshotAccountBalance]\n    snapshotAccountTransaction: [SnapshotAccountTransaction]\n}\n\ntype SnapshotAccountBalance {\n    id: ID\n    includesOffChain: Boolean\n    inflow: Float\n    initialBalance: Float\n    newBalance: Float\n    outflow: Float\n    token: String\n}\n\ntype SnapshotAccountTransaction {\n    amount: Float\n    block: Int\n    counterParty: String\n    counterPartyName: String\n    id: ID!\n    timestamp: String\n    token: String\n    txHash: String\n    txLabel: String\n}",
          initialValue:
            '"{\\"id\\":\\"\\",\\"ownerId\\":\\"\\",\\"ownerType\\":\\"\\",\\"period\\":\\"\\",\\"start\\":\\"\\",\\"end\\":\\"\\",\\"actualsComparison\\":[],\\"snapshotAccount\\":[]}"',
          examples: [],
        },
        local: {
          schema: "type AccountSnapshotLocalState",
          initialValue: '"{}"',
          examples: [],
        },
      },
      modules: [
        {
          id: "3XqsMczWItdBoiPQ/VyXTNNduxA=",
          name: "Snapshot",
          description: "",
          operations: [
            {
              id: "PVeZyYajy8nJe0Y+zRzT+jwSE+Y=",
              name: "SET_ID",
              description: "",
              schema: "input SetIdInput {\n    id: ID!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "AfnDCBOfdGrU+bkibtHuikyJXHY=",
              name: "SET_OWNER_ID",
              description: "",
              schema: "input SetOwnerIdInput {\n    ownerId: ID!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "v3ZXOHRIxLzCaRPU9lYz65Erlnk=",
              name: "SET_OWNER_TYPE",
              description: "",
              schema: "input SetOwnerTypeInput {\n    ownerType: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "+ZoYYO2TLmhBnmr03y/lUZ7Pqu0=",
              name: "SET_PERIOD",
              description: "",
              schema: "input SetPeriodInput {\n    period: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "XxvmrG51cWoeVFX1qCrH5N7kJwM=",
              name: "SET_START",
              description: "",
              schema: "input SetStartInput {\n    start: String!\n}",
              template: "",
              reducer: "",
              errors: [],
              examples: [],
              scope: "global",
            },
            {
              id: "BhYmPnigaKFIA6fASbTvrULfW4U=",
              name: "SET_END",
              description: "",
              schema: "input SetEndInput {\n    end: String!\n}",
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
