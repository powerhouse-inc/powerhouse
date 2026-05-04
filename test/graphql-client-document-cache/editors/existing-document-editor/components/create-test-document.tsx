import {
  DEFAULT_DRIVE_ID,
  reactorGraphqlCreateDocument,
} from "@powerhousedao/reactor-browser";
import { utils } from "document-models/test-doc";
import { randomInteger, randomString } from "remeda";

async function createTestDocument() {
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
  const result = await reactorGraphqlCreateDocument(document);
  return result;
}
export function CreateTestDocument() {
  return (
    <>
      <section>
        <button
          onClick={() => {
            createTestDocument().catch(console.error);
          }}
        >
          create doc
        </button>
      </section>
    </>
  );
}
