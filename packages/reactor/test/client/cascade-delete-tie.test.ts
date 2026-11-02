import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, it } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorClientModule } from "../../src/core/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";
import { TRUST_ANY_SIGNER } from "../utils/signed-as.js";
import {
  CASCADE_TIE_FLAGS,
  sameMillisecondCascade,
} from "./cascade-tie-scenario.js";

describe("cascade delete in one millisecond", () => {
  let module: InProcessReactorClientModule | undefined;

  afterEach(async () => {
    await module?.reactor.kill().completed;
    module = undefined;
  });

  it("removes each relationship before its source's delete, on both replicas", async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            documentModelDocumentModelModule as never,
            driveDocumentModelModule as never,
          ])
          .withExecutorConfig({
            maxConcurrency: 2,
            featureFlags: CASCADE_TIE_FLAGS,
          })
          .withTrustPolicy(TRUST_ANY_SIGNER),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    await sameMillisecondCascade(
      module.client,
      module.reactorModule!.reactor,
      "tie",
    );
  }, 60_000);
});
