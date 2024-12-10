import { Meta } from "@storybook/react";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";
import { Issue, reducer, utils } from "document-models/atlas-feedback-issues";
import { defaultMockUser } from "document-model-libs/utils/storybook/mocks";
import { ADDRESS_ALLOW_LIST } from "document-models/atlas-feedback-issues/src/constants";

const mockIssues: Issue[] = Array.from({ length: 3 }, (_, i) => ({
  phid: `PHID-ISSUE-${i}`,
  relevantNotionIds: [`NOTION-ID-${i}`, `NOTION-ID-${i + 1}`],
  comments: Array.from({ length: 3 }, (_, j) => ({
    phid: `COMMENT-ID-${i}-${j}`,
    issuePhid: `PHID-ISSUE-${i}`,
    relevantNotionId: `NOTION-ID-${i}`,
    createdAt: "2024-01-01",
    creatorAddress: ADDRESS_ALLOW_LIST[0],
    content: `CONTENT-${i}-${j}`,
    lastEditedAt: "2024-01-01",
  })),
  createdAt: "2024-01-01",
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
    user: defaultMockUser,
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
    user: defaultMockUser,
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
