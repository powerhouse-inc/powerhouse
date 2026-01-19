import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedTodoDocument } from "versioned-documents/document-models/todo";

export default function Editor() {
  const [document] = useSelectedTodoDocument();
  if (!document) return null;

  console.log(document);

  return (
    <div className="min-h-screen bg-gray-50">
      <DocumentToolbar />
      <div className="flex justify-center px-4 py-8">
        <div>
          <pre>{JSON.stringify(document, null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}
