"use client";
import {
  useDocuments,
  useSelectedDriveSafe,
} from "@powerhousedao/reactor-browser";
import { map, prop } from "remeda";

async function deleteDocument(identifier: string) {
  const result = await window.reactorGraphQLClient?.DeleteDocument({
    identifier,
  });
  return result;
}

export function TestDocuments() {
  const [drive] = useSelectedDriveSafe();
  const documentIds = map(drive?.state.global.nodes ?? [], prop("id"));
  const documents = useDocuments(documentIds);
  console.log({ drive, documents, documentIds });
  return (
    <div>
      {documents.map((document) => (
        <p key={document.header.id}>
          {document.header.name} ({document.header.documentType}){" "}
          <button
            onClick={() => {
              deleteDocument(document.header.id).catch(console.error);
            }}
          >
            delete
          </button>
        </p>
      ))}
    </div>
  );
}
