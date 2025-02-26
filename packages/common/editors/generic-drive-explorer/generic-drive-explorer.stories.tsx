import { createDriveStoryWithUINodes } from "#editors/utils/storybook";
import { Meta, StoryObj } from "@storybook/react";
import Editor from "./editor.js";

const { meta: _meta, CreateDocumentStory } =
  createDriveStoryWithUINodes(Editor);

const meta: Meta<typeof Editor> = {
  ..._meta,
  title: "Generic Drive Explorer",
};
export const Empty: StoryObj<typeof Editor> = CreateDocumentStory;

export default meta;
