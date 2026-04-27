import { createClient } from "@powerhousedao/reactor-browser";
import { PHDocumentController } from "document-model";
import { TestDocV2 } from "document-models";
import type { TestDocAction, TestDocPHState } from "document-models/test-doc";

const client = createClient("https://switchboard.example.com/graphql");
const Controller = PHDocumentController.forDocumentModel<
  TestDocPHState,
  TestDocAction
>(TestDocV2);
const controller = new Controller();

export function CreateTestDocument() {
  console.log({ client, controller });
  return (
    <>
      <section>
        <button onClick={() => console.log("create doc")}>create doc</button>
      </section>
    </>
  );
}
