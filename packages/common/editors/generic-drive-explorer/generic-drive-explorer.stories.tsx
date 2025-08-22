import { type DocumentStory } from "@powerhousedao/builder-tools/editor-utils";
import { type Meta } from "@storybook/react";
import { createDriveStory } from "../utils/storybook.js";
import Editor from "./editor.js";

const { meta: _meta, CreateDocumentStory } = createDriveStory(Editor);

const meta: Meta<typeof Editor> = {
  ..._meta,
  title: "Generic Drive Explorer",
};

export const Empty: DocumentStory = CreateDocumentStory;

export default meta;
