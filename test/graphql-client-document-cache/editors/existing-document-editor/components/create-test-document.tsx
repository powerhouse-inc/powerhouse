import { createClient } from "@powerhousedao/reactor-browser";

const client = createClient("http://localhost:4002/graphql");

export function CreateTestDocument() {
  async function createDocument() {
    const result = await client.GetDocumentModels();
    console.log({ result });
  }
  return (
    <>
      <section>
        <button
          onClick={() => {
            createDocument().catch(console.error);
          }}
        >
          create doc
        </button>
      </section>
    </>
  );
}
