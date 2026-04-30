import { CreateTestDocument } from "./components/create-test-document.js";
import { TestDocuments } from "./components/test-documents.js";

export default function Editor() {
  return (
    <>
      {<TestDocuments />}
      {<CreateTestDocument />}
    </>
  );
}
