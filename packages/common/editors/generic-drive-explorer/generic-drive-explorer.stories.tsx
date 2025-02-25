import { createDriveStoryWithUINodes } from "#editors/utils/storybook";
import { Meta } from "@storybook/react";
import Editor from "./editor";

const { meta, CreateDocumentStory: Empty } =
  createDriveStoryWithUINodes(Editor);

export { Empty };

export default { ...meta, title: "Generic Drive Explorer" } as Meta<
  typeof Editor
>;
