import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { type DocumentNode, Kind, print } from "graphql";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  generateDocumentModelSchema,
  getDocumentModelTypeDefs,
} from "../src/utils/create-schema.js";

const EMPTY: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

function vetraModel(name: string): DocumentModelGlobalState {
  const url = new URL(
    `../../vetra/document-models/${name}/${name}.json`,
    import.meta.url,
  );
  return JSON.parse(readFileSync(url, "utf8")) as DocumentModelGlobalState;
}

function servedSdl(global: DocumentModelGlobalState): string {
  const module = { documentModel: { global } } as DocumentModelModule;
  return [
    "# generated types",
    print(getDocumentModelTypeDefs([module], EMPTY)),
    "# legacy API",
    print(generateDocumentModelSchema(global)),
    "# new API",
    print(generateDocumentModelSchema(module, { useNewApi: true })),
  ].join("\n\n");
}

describe("vetra's schema-first models serve their stored SDL", () => {
  it("serves processor-module as before", async () => {
    await expect(
      `${servedSdl(vetraModel("processor-module"))}\n`,
    ).toMatchFileSnapshot("./goldens/stored-sdl/processor-module.graphql.txt");
  });
});
