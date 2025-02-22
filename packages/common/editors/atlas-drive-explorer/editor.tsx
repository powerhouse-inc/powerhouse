import { EditorProps } from "document-model/document";
import {
  DocumentDriveAction,
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-models/document-drive";
import { EditorLayout } from "./components/EditorLayout";

export type IGenericDriveExplorerEditorProps = {
  className?: string;
  children?: React.ReactNode;
};

export type IProps = EditorProps<
  DocumentDriveState,
  DocumentDriveAction,
  DocumentDriveLocalState
> &
  React.HTMLProps<HTMLDivElement>;

export default function Editor(props: IProps) {
  return (
    <div
      // eslint-disable-next-line tailwindcss/no-custom-classname
      className="atlas-drive-explorer"
      style={{ padding: "0.75rem 0.75rem 0 0.75rem", boxSizing: "content-box" }}
    >
      <EditorLayout>
        <style>
          {`
            .atlas-drive-explorer > main {
              border: 1px solid #EEEEEE;
            }
            
            .atlas-drive-explorer > main > aside {
              height: calc(100svh - 2.25rem - 18px);
            }

            .d-none {
              display: none;
            }

            #document-editor-context > div.flex:first-child {
              position: absolute;
              right: 0;
              top: 16px;
            }`}
        </style>
        <h1 className="mt-12 text-2xl font-bold text-gray-900 dark:text-gray-50">
          Scope Document
        </h1>
      </EditorLayout>
    </div>
  );
}
