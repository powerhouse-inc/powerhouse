import { DocumentModelModule } from "document-model";
import { describe, test } from "vitest";
import { ReactorBuilder } from "../src/server/builder.js";

import { documentModelDocumentModelModule } from "document-model";
import { driveDocumentModelModule } from "../src/drive-document-model/module.js";

describe("Internal Listener", () => {
  const documentModels = [
    documentModelDocumentModelModule,
    driveDocumentModelModule,
  ] as DocumentModelModule<any>[];

  async function buildReactor() {
    const builder = new ReactorBuilder(documentModels);
    const reactor = builder.build();
    await reactor.initialize();
    return reactor;
  }

  test("should add document", async ({ expect }) => {
    const reactor = await buildReactor();

    const documentToCreate =
      documentModelDocumentModelModule.utils.createDocument();
    const createdDocument = await reactor.addDocument(documentToCreate);
    expect(createdDocument).toMatchObject(documentToCreate);

    const retrievedDocument = await reactor.getDocument(
      createdDocument.header.id,
    );
    expect(retrievedDocument).toMatchObject(createdDocument);
  });

  test("should create document of a given document type", async ({
    expect,
  }) => {
    const reactor = await buildReactor();

    const document = await reactor.addDocument("powerhouse/document-model");
    expect(document).toBeDefined();

    const result = await reactor.getDocument(document.header.id);
    expect(result).toStrictEqual(document);
  });
});
