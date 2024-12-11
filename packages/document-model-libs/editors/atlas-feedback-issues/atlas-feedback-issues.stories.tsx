import { Meta } from "@storybook/react";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";
import { Issue, reducer, utils } from "document-models/atlas-feedback-issues";
import { defaultMockUser } from "document-model-libs/utils/storybook/mocks";
import { ADDRESS_ALLOW_LIST } from "document-models/atlas-feedback-issues/src/constants";

const mockIssues: Issue[] = Array.from({ length: 5 }, (_, i) => ({
  phid: `PHID-ISSUE-${i}`,
  notionIds: [`NOTION-ID-${i}`, `NOTION-ID-${i + 1}`],
  comments: Array.from({ length: 5 }, (_, j) => ({
    phid: `COMMENT-ID-${i}-${j}`,
    issuePhid: `PHID-ISSUE-${i}`,
    notionId: `NOTION-ID-${i}`,
    createdAt: "2024-01-01T08:00:00.000Z",
    creatorAddress: ADDRESS_ALLOW_LIST[j % 2],
    content: `CONTENT-${i}-${j}`,
    lastEditedAt: "2024-01-01T08:00:00.000Z",
  })),
  createdAt: "2024-01-01T08:00:00.000Z",
  creatorAddress: ADDRESS_ALLOW_LIST[0],
}));

const { meta, CreateDocumentStory: NotSignedIn } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: [],
      },
      local: {},
    },
  }),
  {
    user: undefined,
  },
);

const { CreateDocumentStory: NotOnAllowList } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: [],
      },
      local: {},
    },
  }),
  {
    user: {
      ...defaultMockUser,
      address: "0x0000000000000000000000000000000000000000",
    },
  },
);

const { CreateDocumentStory: AllowedUser } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: [],
      },
      local: {},
    },
  }),
  {
    user: {
      ...defaultMockUser,
      address: ADDRESS_ALLOW_LIST[0],
    },
    customProp: "value",
    onCustomAction: () => console.log("custom action"),
  },
);

const { CreateDocumentStory: NotSignedInWithItems } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: mockIssues,
      },
      local: {},
    },
  }),
  {
    user: undefined,
  },
);

const { CreateDocumentStory: NotOnAllowListWithItems } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: mockIssues,
      },
      local: {},
    },
  }),
  {
    user: {
      ...defaultMockUser,
      address: "0x0000000000000000000000000000000000000000",
    },
  },
);

const { CreateDocumentStory: AllowedUserWithItems } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: mockIssues,
      },
      local: {},
    },
  }),
  {
    user: {
      ...defaultMockUser,
      address: ADDRESS_ALLOW_LIST[0],
    },
  },
);

export {
  NotSignedIn,
  NotOnAllowList,
  AllowedUser,
  NotSignedInWithItems,
  NotOnAllowListWithItems,
  AllowedUserWithItems,
};

export default { ...meta, title: "Atlas Feedback Issues" } as Meta<
  typeof Editor
>;
