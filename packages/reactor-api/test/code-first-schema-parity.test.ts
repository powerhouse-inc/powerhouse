import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { inspectDocumentModelDefinition } from "document-model";
import type { GraphQLInputObjectType } from "graphql";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSchema,
  generateDocumentModelSchema,
  typeDefinitionNames,
} from "../src/utils/create-schema.js";
import { sortedSchema } from "./utils/document-model-host.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const goldens = `${repoRoot}packages/document-model/test/parity/goldens/`;

type Golden = {
  readonly original: string;
  readonly version: number;
  readonly documentModel: DocumentModelModule["documentModel"];
  readonly definition: unknown;
};

const corpus = readdirSync(goldens)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => {
    const golden = JSON.parse(
      readFileSync(`${goldens}${file}`, "utf8"),
    ) as Golden;
    const stored = JSON.parse(
      readFileSync(`${repoRoot}${golden.original}`, "utf8"),
    ) as
      | DocumentModelGlobalState
      | { readonly state: { readonly global: DocumentModelGlobalState } };
    const global = "state" in stored ? stored.state.global : stored;
    const twin = {
      documentModel: golden.documentModel,
      definition: golden.definition,
    } as unknown as DocumentModelModule;
    const original = {
      documentModel: { global },
    } as unknown as DocumentModelModule;
    return [file.replace(/\.json$/, ""), twin, original] as const;
  });

function servedSchema(module: DocumentModelModule, useNewApi: boolean) {
  const own = generateDocumentModelSchema(module, { useNewApi });
  return createSchema([module], {}, own, {
    ownTypeNames: typeDefinitionNames(own),
  });
}

function served(module: DocumentModelModule) {
  return {
    legacy: sortedSchema(servedSchema(module, false)),
    newApi: sortedSchema(servedSchema(module, true)),
  };
}

function lineDelta(twin: string, original: string) {
  const count = (text: string) => {
    const lines = new Map<string, number>();
    for (const line of text.split("\n")) {
      lines.set(line, (lines.get(line) ?? 0) + 1);
    }
    return lines;
  };
  const only = (a: Map<string, number>, b: Map<string, number>) =>
    [...a].flatMap(([line, n]) =>
      Array<string>(Math.max(0, n - (b.get(line) ?? 0))).fill(line),
    );
  const [t, o] = [count(twin), count(original)];
  return { twin: only(t, o), original: only(o, t) };
}

const EXTENSION_FIELDS = ["  flagged: Boolean", "  note: String"];

const DESCRIPTION_PLACEMENT = new Set(["document-drive"]);

function initialStateScopes(module: DocumentModelModule): string[] {
  const input = servedSchema(module, true).getType(
    "AppModule_InitialStateInput",
  ) as GraphQLInputObjectType;
  return Object.keys(input.getFields());
}

describe("a code-first twin served from its definition", () => {
  it("covers every parity golden", () => {
    expect(corpus.map(([name]) => name)).toStrictEqual([
      "app-module",
      "document-drive",
      "extensions",
      "processor-module",
      "reactor-group",
      "sample",
      "versioned-todo.v1",
      "versioned-todo.v2",
      "vetra-package",
    ]);
  });

  it.each(corpus)(
    "%s serves the schema its schema-first original serves",
    (name, twin, original) => {
      expect(inspectDocumentModelDefinition(twin).kind).toBe("structured");
      expect(inspectDocumentModelDefinition(original).kind).toBe("stored");
      const [ofTwin, ofOriginal] = [served(twin), served(original)];
      for (const api of ["legacy", "newApi"] as const) {
        expect(lineDelta(ofTwin[api], ofOriginal[api])).toStrictEqual({
          twin:
            name === "extensions" && api === "newApi" ? EXTENSION_FIELDS : [],
          original: [],
        });
      }
      if (name !== "extensions" && !DESCRIPTION_PLACEMENT.has(name)) {
        expect(ofTwin).toStrictEqual(ofOriginal);
      }
    },
  );

  it("orders the twin's initial-state scopes global first, unlike its original", () => {
    const [, twin, original] = corpus.find(([name]) => name === "app-module")!;
    expect(initialStateScopes(original)).toStrictEqual(["local", "global"]);
    expect(initialStateScopes(twin)).toStrictEqual(["global", "local"]);
  });
});
