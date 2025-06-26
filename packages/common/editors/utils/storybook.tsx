import {
  createDocumentStory,
  type DocumentStory,
  type EditorStoryArgs,
  type EditorStoryComponent,
  type EditorStoryProps,
} from "@powerhousedao/builder-tools/editor-utils";
import { type Decorator, type Meta } from "@storybook/react";
import {
  driveDocumentModelModule,
  type DocumentDriveDocument,
  type DocumentDriveLocalState,
  type DocumentDriveState,
  type FileNode,
} from "document-drive";
import { type ExtendedState, type PartialState } from "document-model";
import { type ComponentType } from "react";
import { type DriveEditorProps } from "../../state/types.js";

export function createDriveStory(
  Editor: ComponentType<DriveEditorProps>,
  initialState?: ExtendedState<
    PartialState<DocumentDriveState>,
    PartialState<DocumentDriveLocalState>
  >,
  additionalStoryArgs?: EditorStoryArgs<DocumentDriveDocument>,
  decorators?: Decorator<EditorStoryProps<DocumentDriveDocument>>[],
): {
  meta: Meta<EditorStoryComponent<DocumentDriveDocument>>;
  CreateDocumentStory: DocumentStory<DocumentDriveDocument>;
} {
  const EditorWithMockAddFileHandler = (
    props: EditorStoryProps<DocumentDriveDocument>,
  ) => {
    const mockAddFile = async (
      file: string | File,
      driveId: string,
      name?: string,
      parentFolderId?: string,
    ): Promise<FileNode> => {
      console.log("Mock addFile called with:", {
        file,
        driveId,
        name,
        parentFolderId,
      });
      return {
        id: "mock-file-id",
        name: name || "mock-file",
        kind: "file",
        documentType: "mock-document-type",
        parentFolder: parentFolderId || null,
        synchronizationUnits: [],
      };
    };
    const propsWithMock: DriveEditorProps = {
      ...props,
      addFile: mockAddFile,
    };
    return <Editor {...propsWithMock} />;
  };

  return createDocumentStory(
    EditorWithMockAddFileHandler,
    driveDocumentModelModule.reducer,
    initialState ?? {
      ...driveDocumentModelModule.utils.createExtendedState({
        state: { global: { name: "Powerhouse" }, local: {} },
      }),
      id: "powerhouse",
    },
    additionalStoryArgs,
    decorators,
  );
}
