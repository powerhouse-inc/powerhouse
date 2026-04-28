import { createClient } from "@powerhousedao/reactor-browser";

const client = createClient("https://switchboard.example.com/graphql");

export function CreateTestDocument() {
  console.log({ client });
  return (
    <>
      <section>
        <button onClick={() => console.log("create doc")}>create doc</button>
      </section>
    </>
  );
}
