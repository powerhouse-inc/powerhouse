import { Meta } from "@storybook/react";
import Editor from "./editor";
import { createDocumentStory } from "document-model-libs/utils";
import { reducer, utils } from "document-models/atlas-feedback-issues";
const { meta, CreateDocumentStory: AtlasFeedbackIssues } = createDocumentStory(
  Editor,
  reducer,
  utils.createExtendedState({
    state: {
      global: {
        issues: Array.from({ length: 10 }, (_, i) => ({
          phid: `PHID-ISSUE-${i}`,
          relevantNotionIds: [`NOTION-ID-${i}`, `NOTION-ID-${i + 1}`],
          comments: [],
          createdAt: "2024-01-01",
          creatorAddress: `0x1234567890${i}`,
          threadUrl: `https://example.com/thread-${i}`,
        })),
      },
      local: {},
    },
  }),
);
export { AtlasFeedbackIssues };

export default { ...meta, title: "Atlas Feedback Issues" } as Meta<
  typeof Editor
>;
