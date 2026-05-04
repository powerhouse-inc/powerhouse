"use client";
import { useTestDocDocumentsInSelectedDrive } from "document-models/test-doc";
import { useState } from "react";
import { map, prop } from "remeda";
import { EditorTestDocument } from "./edit-test-document.js";

async function deleteDocument(identifier: string) {
  const result = await window.reactorGraphQLClient?.DeleteDocument({
    identifier,
  });
  return result;
}

async function deleteDocuments(identifiers: string[]) {
  const result = await window.reactorGraphQLClient?.DeleteDocuments({
    identifiers,
  });
  return result;
}

export function TestDocuments() {
  const [isEditing, setIsEditing] = useState(false);
  const documents = useTestDocDocumentsInSelectedDrive();
  return (
    <div>
      <button onClick={() => setIsEditing(!isEditing)}>toggle edit</button>
      {isEditing ? (
        <>
          {documents?.map((document) => (
            <div key={document.header.id}>
              <EditorTestDocument id={document.header.id} />
            </div>
          ))}
        </>
      ) : (
        <>
          {documents?.map((document) => (
            <p key={document.header.id}>
              {document.state.global.name} ({document.header.documentType}){" "}
              <button
                onClick={() => {
                  deleteDocument(document.header.id).catch(console.error);
                }}
              >
                delete
              </button>
            </p>
          ))}
        </>
      )}
      <button
        onClick={() => {
          deleteDocuments(map(documents ?? [], prop("header", "id"))).catch(
            console.error,
          );
        }}
      >
        delete all
      </button>
    </div>
  );
}
