import { createDriveStory } from "@powerhousedao/common";
import type { Meta } from "@storybook/react";
import { Editor } from "./editor.js";

const { meta: _meta, CreateDocumentStory } = createDriveStory(Editor);

const meta: Meta<typeof Editor> = {
  ..._meta,
  title: "Generic Drive Explorer",
} as Meta<typeof Editor>;
export const Empty: any = CreateDocumentStory;

export default meta;
