import {
  createDocumentStory,
  type DocumentStory,
  type EditorStoryArgs,
  type EditorStoryProps,
} from "@powerhousedao/builder-tools/editor-utils";
import { DriveContextProvider } from "@powerhousedao/reactor-browser";
import { type Decorator, type Meta } from "@storybook/react";
import { driveDocumentModelModule } from "document-drive";
import { defaultBaseState, type DocumentModelModule } from "document-model";

export function createDriveStory<T extends (props: any) => React.JSX.Element>(
  Editor: T,
  initialState?: any,
  additionalStoryArgs?: EditorStoryArgs,
  decorators?: Decorator<EditorStoryProps>[],
): {
  meta: Meta<T>;
  CreateDocumentStory: DocumentStory;
} {
  const story = createDocumentStory(
    Editor,
    driveDocumentModelModule.reducer,
    initialState ?? {
      ...driveDocumentModelModule.utils.createExtendedState({
        ...defaultBaseState(),
        global: { name: "Powerhouse" },
        local: {},
      }),
    },
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
