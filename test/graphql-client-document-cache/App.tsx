import {
  createClient,
  phDocumentFromFindDocumentsQueryItems,
  setDrives,
  setSelectedDriveId,
  setSelectedNode,
  useEventHandlers,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared";
import { DriveDocumentSchema } from "@powerhousedao/shared/document-drive";
import { ExistingDocumentEditor } from "editors";
import { useEffect } from "react";
import type { GetDocumentModelsQuery } from "../../packages/reactor-browser/src/graphql/gen/schema.js";

type GetDocumentModelsResult =
  GetDocumentModelsQuery["documentModels"]["items"];

const DEFAULT_DRIVE_ID = "powerhouse";

const client = createClient("http://localhost:4001/graphql");

async function fetchDrives(): Promise<DocumentDriveDocument[]> {
  const result = await client.FindDocuments({
    search: { type: "powerhouse/document-drive" },
  });
  const documents = result.findDocuments.items;
  if (!documents.length) return [];
  return phDocumentFromFindDocumentsQueryItems(
    result.findDocuments.items,
    DriveDocumentSchema,
  ) as DocumentDriveDocument[];
}

export default function App() {
  useEventHandlers();
  useEffect(() => {
    fetchDrives()
      .then((drives) => {
        setDrives(drives);
        setSelectedDriveId(DEFAULT_DRIVE_ID);
        setSelectedNode(undefined);
      })
      .catch(console.error);
  }, []);
  return (
    <>
      <section>
        <ExistingDocumentEditor.Component />
      </section>
    </>
  );
}
