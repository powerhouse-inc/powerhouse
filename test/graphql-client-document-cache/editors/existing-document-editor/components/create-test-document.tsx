import { utils } from "document-models/test-doc";
import { randomInteger, randomString } from "remeda";
import { DEFAULT_DRIVE_ID } from "../../../constants.js";

async function createTestDocument(parentIdentifier: string) {
  const document = utils.createDocument(
    utils.createState({
      global: {
        name: `test-doc-${randomInteger(1, 100)}`,
        description: randomString(15),
        id: randomInteger(1, 1000),
        value: randomString(1000),
      },
    }),
  );
  const result = await window.reactorGraphQLClient?.CreateDocument({
    document: { ...document, name: "test-name" },
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
            createTestDocument(DEFAULT_DRIVE_ID).catch(console.error);
          }}
        >
          create doc
        </button>
      </section>
    </>
  );
}
