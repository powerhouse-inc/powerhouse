import { reactorGraphqlCreateDocument } from "@powerhousedao/reactor-browser";
import { createTestDocDocument } from "document-models/test-doc";

async function createTestDocument() {
  const document = createTestDocDocument();
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
