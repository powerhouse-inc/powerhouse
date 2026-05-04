import { useDocument } from "@powerhousedao/reactor-browser";
import { setTestName, type TestDocDocument } from "document-models/test-doc";
import { useState } from "react";

export function EditorTestDocument(props: { id: string }) {
  const { id } = props;
  const document = useDocument(id) as TestDocDocument;
  const [name, setName] = useState(document.state.global.name ?? "");

  if (!document) return null;

  const handleSetName = async (name: string) => {
    console.log({ name });
    const result = await window.reactorGraphQLClient?.MutateDocumentAsync({
      documentIdentifier: id,
      actions: [setTestName({ name })],
    });
    console.log({ result });
    return result;
  };

  return (
    <div className="mx-auto max-w-4xl bg-gray-50 p-6">
      <div>
        {/* Edit document name */}
        <label className="my-6">
          <h3>Document Name</h3>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            placeholder="Enter document name..."
            title="Edit document name and click outside to save."
            className="font-semibold"
          />
          <button
            onClick={() => {
              handleSetName(name).catch(console.error);
            }}
          >
            submit
          </button>
        </label>
      </div>
    </div>
  );
}
