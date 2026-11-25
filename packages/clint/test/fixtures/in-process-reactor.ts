import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { createLocalSigner } from "./local-signer.js";

/**
 * A real in-process reactor for the tests that need a full client: in-memory
 * PGlite, the document-model and drive models, and a fresh local signer (new
 * documents are v2-required by default, and that refuses an unsigned write).
 * It stands in for the embedded reactor clint no longer builds; stop it with
 * `module.reactor.kill().completed`.
 */
export async function buildTestReactor(): Promise<InProcessReactorClientModule> {
  const reactorBuilder = new ReactorBuilder().withDocumentModelSources([
    documentModelDocumentModelModule as never,
    driveDocumentModelModule as never,
  ]);
  return new ReactorClientBuilder()
    .withReactorBuilder(reactorBuilder)
    .withSigner(await createLocalSigner())
    .buildModule();
}
