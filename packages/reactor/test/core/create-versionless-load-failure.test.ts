import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  createPresignedHeader,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { TestP256Signer } from "../utils/p256-signer.js";

const DOCUMENT_MODEL = "powerhouse/document-model";

describe("a versionless create whose model fails to load", () => {
  const reactors: IReactor[] = [];

  afterEach(() => {
    for (const reactor of reactors.splice(0)) {
      reactor.kill();
    }
  });

  it("fails the job with the loader's own error", async () => {
    const load = vi.fn(() =>
      Promise.reject(new Error(`no package for ${DOCUMENT_MODEL}`)),
    );
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([driveDocumentModelModule as never])
          .withDocumentModelLoader({ load }),
      )
      .withSigner((await TestP256Signer.create()).asISigner())
      .buildModule();
    reactors.push(built.reactor);
    const document = {
      ...documentModelDocumentModelModule.utils.createDocument(),
      header: createPresignedHeader(undefined, DOCUMENT_MODEL),
    } as PHDocument;

    const job = await built.client.waitForJob(
      await built.reactor.create(document),
    );

    expect(job.error?.message).toContain(`no package for ${DOCUMENT_MODEL}`);
    expect(load).toHaveBeenCalledTimes(1);
  });
});
