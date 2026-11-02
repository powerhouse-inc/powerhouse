import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { signaturePolicyOf } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";
import { RoutingReactorClient } from "../src/index.js";
import { FakeBackend, REMOTE, silent } from "./stubs.js";

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

describe("router newDocument with a default backend", () => {
  const modules = [
    documentModelDocumentModelModule as unknown as DocumentModelModule,
  ];

  it("asks the default backend for a parentless create's defaults", async () => {
    const local = new FakeBackend("local");
    const sb = new FakeBackend("sb", undefined, REMOTE);
    const client = new RoutingReactorClient([local.config(), sb.config()], {
      primaryBackend: "local",
      defaultBackend: "sb",
      documentModelModules: modules,
      onDiagnostic: silent,
    });

    await client.newDocument(DOCUMENT_TYPE);

    expect(sb.count("getCreateSignaturePolicy")).toBe(1);
    expect(sb.count("getCreateProtocolVersions")).toBe(1);
    expect(local.called("getCreateProtocolVersions")).toBe(false);
  });

  it("asks the backend an id is placed on, not the default backend", async () => {
    const local = new FakeBackend("local");
    const sb = new FakeBackend("sb", undefined, REMOTE);
    sb.failing.add("getCreateProtocolVersions");
    sb.failing.add("getCreateSignaturePolicy");
    const client = new RoutingReactorClient([local.config(), sb.config()], {
      primaryBackend: "local",
      defaultBackend: "sb",
      collections: { "local-drive": "local" },
      documentModelModules: modules,
      onDiagnostic: silent,
    });

    const document = await client.newDocument(DOCUMENT_TYPE, {
      id: "local-drive",
    });
    await client.create(document);

    expect(local.count("getCreateSignaturePolicy")).toBe(1);
    expect(local.count("getCreateProtocolVersions")).toBe(1);
    expect(local.count("create")).toBe(1);
    expect(sb.called("getCreateProtocolVersions")).toBe(false);
    expect(sb.called("create")).toBe(false);
  });
});
