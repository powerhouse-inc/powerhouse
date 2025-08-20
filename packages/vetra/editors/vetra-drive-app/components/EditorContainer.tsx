import { DefaultEditorLoader } from "@powerhousedao/design-system";
import {
  useSelectedDrive,
  type IDriveContext,
  type VetraDocumentModelModule,
  type VetraEditorModule,
} from "@powerhousedao/reactor-browser";
import { error } from "console";
import { Suspense } from "react";

export interface EditorContainerProps {
  driveId: string;
  documentId: string;
  documentType: string;
  context: IDriveContext;
  documentModelModule: VetraDocumentModelModule;
  editorModule: VetraEditorModule;
}

export const EditorContainer: React.FC<EditorContainerProps> = (props) => {
  const { context, editorModule } = props;
  const drive = useSelectedDrive();

  const loadingContent = (
    <div className="flex h-full flex-1 items-center justify-center">
      <DefaultEditorLoader />
    </div>
  );

  if (!document) return loadingContent;

  const EditorComponent = editorModule.Component;

  return (
    <Suspense fallback={loadingContent}>
      <EditorComponent context={context} document={drive} error={error} />
    </Suspense>
  );
};
