import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { signaturePolicyOf } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";
import { RoutingReactorClient } from "../src/index.js";
import { FakeBackend, silent } from "./stubs.js";

const DOCUMENT_TYPE = "powerhouse/document-model";

function routerOver(backend: FakeBackend): RoutingReactorClient {
  const api = backend.api();
  return new RoutingReactorClient(
    [
      backend.config({
        backend: {
          ...api,
          getDocumentModelModules: () =>
            Promise.resolve({
              results: [
                documentModelDocumentModelModule as unknown as DocumentModelModule,
              ],
              options: { cursor: "", limit: 1 },
            }),
        },
      }),
    ],
    { onDiagnostic: silent },
  );
}

describe("router newDocument", () => {
  it("heads the document with the backend's create signature policy", async () => {
    const backend = new FakeBackend("one");

    const document = await routerOver(backend).newDocument(DOCUMENT_TYPE);

    expect(backend.count("getCreateSignaturePolicy")).toBe(1);
    expect(signaturePolicyOf(document.header)).toBe("legacy");
  });

  it("does not ask for the policy when the caller names one", async () => {
    const backend = new FakeBackend("one");

    const document = await routerOver(backend).newDocument(DOCUMENT_TYPE, {
      signaturePolicy: "v2-required",
    });

    expect(backend.called("getCreateSignaturePolicy")).toBe(false);
    expect(signaturePolicyOf(document.header)).toBe("v2-required");
  });
});
