import type {
  DocumentStory,
  EditorStoryArgs,
} from "@powerhousedao/builder-tools/editor-utils";
import { createDocumentStory } from "@powerhousedao/builder-tools/editor-utils";
import { DriveContextProvider } from "@powerhousedao/reactor-browser";
import type { Decorator, Meta } from "@storybook/react";
import { driveDocumentModelModule } from "document-drive";
import { createState } from "document-drive/drive-document-model/gen/index";
import type { DocumentModelModule } from "document-model";
import { defaultBaseState } from "document-model";

export function createDriveStory<T extends (props: any) => React.JSX.Element>(
  Editor: T,
  initialState?: any,
  additionalStoryArgs?: EditorStoryArgs,
  decorators?: Decorator[],
): {
  meta: Meta<T>;
  CreateDocumentStory: DocumentStory;
} {
  const story = createDocumentStory(
    Editor,
    driveDocumentModelModule.reducer,
    initialState ?? createState(defaultBaseState(), { name: "Powerhouse" }),
    additionalStoryArgs,
    [
      (Story, context) => (
        <DriveContextProvider
          value={{
            onAddFile: () => Promise.resolve(),
            onAddFolder: () => Promise.resolve(undefined),
            onRenameNode: () => Promise.resolve(undefined),
            onCopyNode: () => Promise.resolve(),
            onMoveNode: () => Promise.resolve(),
            onDuplicateNode: () => Promise.resolve(),
            showDeleteNodeModal: () => {},
            showCreateDocumentModal(documentModel: DocumentModelModule) {
              return Promise.resolve({
                name: `New ${documentModel.documentModel.name}`,
              });
            },
          }}
        >
          <Story />
        </DriveContextProvider>
      ),
      ...(decorators ?? []),
    ],
  );
  return story as {
    meta: Meta<T>;
    CreateDocumentStory: DocumentStory;
  };
}
