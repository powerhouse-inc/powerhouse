import {
  actions,
  withSignaturePolicy,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDocumentAction } from "../../src/actions/index.js";
import type { IReactorClient } from "../../src/client/types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { BatchJobFailedError } from "../../src/shared/errors.js";
import { JobStatus } from "../../src/shared/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

describe("ReactorClient.executeBatch when a job fails", () => {
  let client: IReactorClient;
  let reactor: IReactor;

  // A reused id is only possible on a legacy document.
  function legacyDocument(): PHDocument {
    return withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
    );
  }

  beforeEach(async () => {
    client = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule,
        ]),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .build();
    reactor = (client as unknown as { reactor: IReactor }).reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  it("throws with every job's final state, the failed key and its error name", async () => {
    const existing = legacyDocument();
    await client.create(existing);
    const { header } = existing;

    const thrown = await client
      .executeBatch({
        jobs: [
          {
            key: "rename",
            documentId: header.id,
            scope: "global",
            branch: "main",
            actions: [actions.setName("renamed")],
            dependsOn: [],
          },
          {
            key: "duplicate",
            documentId: header.id,
            scope: "document",
            branch: "main",
            actions: [
              createDocumentAction({
                model: header.documentType,
                version: 0,
                documentId: header.id,
                signing: {
                  signature: header.id,
                  publicKey: header.sig.publicKey,
                  nonce: header.sig.nonce,
                  createdAtUtcIso: header.createdAtUtcIso,
                  documentType: header.documentType,
                },
              }),
            ],
            dependsOn: ["rename"],
          },
        ],
      })
      .catch((error: unknown) => error);

    expect(BatchJobFailedError.isError(thrown)).toBe(true);
    const error = thrown as BatchJobFailedError;
    expect(error.key).toBe("duplicate");
    expect(error.message).toContain(header.id);
    expect(error.jobs.rename.status).toBe(JobStatus.READ_READY);
    expect(error.jobs.rename.documentId).toBe(header.id);
    expect(error.jobs.duplicate.status).toBe(JobStatus.FAILED);
    expect(error.jobs.duplicate.error?.name).toBe("DocumentAlreadyExistsError");
    expect((error.cause as Error).name).toBe("DocumentAlreadyExistsError");
  });
});
