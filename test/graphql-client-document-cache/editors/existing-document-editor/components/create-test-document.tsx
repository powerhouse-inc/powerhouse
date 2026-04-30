import type { DocumentModelGlobalState } from "@powerhousedao/shared";
import {
  documentModelCreateDocument,
  documentModelCreateState,
} from "document-model";
import { randomInteger, randomString } from "remeda";
import { DEFAULT_DRIVE_ID } from "../../../constants.js";

async function createTestDocument(parentIdentifier: string) {
  const document = documentModelCreateDocument(
    documentModelCreateState({
      global: {
        name: `test-doc-${randomInteger(1, 100)}`,
        description: randomString(15),
      } as DocumentModelGlobalState,
    }),
  );
  const result = await window.reactorGraphQLClient?.CreateDocument({
    document,
    parentIdentifier,
  });
  return result;
}
export function CreateTestDocument() {
  return (
    <>
      <section>
        <button
          onClick={() => {
            createTestDocument(DEFAULT_DRIVE_ID)
              .then((newDoc) => console.log({ newDoc }))
              .catch(console.error);
          }}
        >
          create doc
        </button>
      </section>
    </>
  );
}
