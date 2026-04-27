import { useSelectedDocumentId } from "@powerhousedao/reactor-browser";
import { isString } from "remeda";
import { CreateTestDocument } from "./components/create-test-document.js";
import { EditorTestDocument } from "./components/edit-test-document.js";

export default function Editor() {
  const selectedDocumentId = useSelectedDocumentId();
  if (isString(selectedDocumentId)) return <EditorTestDocument />;
  return <CreateTestDocument />;
}
