import { useInitReactorGraphqlClient } from "@powerhousedao/reactor-browser";
import { ExistingDocumentEditor } from "editors";

export default function App() {
  const hasInit = useInitReactorGraphqlClient();

  if (!hasInit) return null;

  return <ExistingDocumentEditor.Component />;
}
