import { useSetPHAppConfig } from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveAction,
  DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type { EditorProps } from "@powerhousedao/shared/document-model";
import { editorConfig } from "./config.js";
import { VetraExplorer } from "./Explorer.js";

type DriveAppProps = EditorProps<DocumentDriveDocument, DocumentDriveAction>;

export default function Editor({ document, children }: DriveAppProps) {
  useSetPHAppConfig(editorConfig);
  return <VetraExplorer document={document}>{children}</VetraExplorer>;
}
