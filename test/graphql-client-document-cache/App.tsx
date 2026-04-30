import { ExistingDocumentEditor } from "editors";
import { useEffect, useState } from "react";
import { DEFAULT_DRIVE_ID } from "./constants.js";
import { init } from "./init.js";

export default function App() {
  const [hasInit, setHasInit] = useState(false);

  useEffect(() => {
    if (hasInit) return;

    init(DEFAULT_DRIVE_ID)
      .then(() => setHasInit(true))
      .catch(console.error);
  }, [hasInit]);

  if (!hasInit) return null;

  return <ExistingDocumentEditor.Component />;
}
