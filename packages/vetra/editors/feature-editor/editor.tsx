import { DocumentToolbar } from "@powerhousedao/design-system/connect";
import { useSelectedFeatureDocument } from "document-models/feature";
import { FeatureEditor } from "./FeatureEditor.js";

export default function Editor() {
  const [document, dispatch] = useSelectedFeatureDocument();
  return (
    <div className="mx-auto max-w-4xl bg-accent p-6">
      <DocumentToolbar />
      <FeatureEditor document={document} dispatch={dispatch} />
    </div>
  );
}
