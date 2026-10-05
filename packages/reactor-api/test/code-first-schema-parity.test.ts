import type {
  DocumentModelGlobalState,
  DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createSchema,
  generateDocumentModelSchema,
} from "../src/utils/create-schema.js";
import { printSchema } from "./utils/graphql-host.js";

const GOLDENS = fileURLToPath(
  new URL("../../document-model/test/parity/goldens/", import.meta.url),
);

const ROOTS = readdirSync(GOLDENS)
  .filter((file) => file.endsWith(".definition.json"))
  .map((file) => file.replace(".definition.json", ""))
  .sort();

/**
 * The stored-SDL path namespaces any word that follows `type ` in a
 * description, such as "document type ids", as if it named a type. It then
 * prefixes that word everywhere, field names included, and prefixes real type
 * names inside descriptions. The structured path does neither. Each entry maps
 * text the stored path prints to the text the structured path prints instead.
 */
const STORED_SDL_REGEX_DEFECTS: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  "app-module": { AppModule_ids: "ids" },
  "document-editor": {
    DocumentEditor_id: "id",
    DocumentEditor_listed: "listed",
  },
  "processor-module": { ProcessorModule_id: "id" },
  "vetra-package": {
    "VetraPackage_Author/": "Author/",
    "VetraPackage_Author's": "Author's",
  },
};

/** The stored path's schema with its known regex renames undone. */
function withoutRegexDefects(
  stored: string,
  defects: Readonly<Record<string, string>>,
): string {
  return printSchema(
    Object.entries(defects).reduce(
      (sdl, [mangled, text]) => sdl.replaceAll(mangled, text),
      stored,
    ),
  );
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(`${GOLDENS}${file}`, "utf8"));
}

function servedSchema(module: DocumentModelModule, useNewApi: boolean) {
  return printSchema(
    createSchema(
      [module],
      {},
      generateDocumentModelSchema(module, { useNewApi }),
    ),
  );
}

describe.each(ROOTS)("the %s golden", (root) => {
  const global = (
    readJson(`${root}.state.json`) as {
      global: DocumentModelGlobalState;
    }
  ).global;
  const schemaFirst = {
    documentModel: { global },
    actions: {},
  } as unknown as DocumentModelModule;
  const codeFirst = {
    ...schemaFirst,
    definition: readJson(`${root}.definition.json`),
  } as DocumentModelModule;
  const defects = STORED_SDL_REGEX_DEFECTS[root] as
    | (typeof STORED_SDL_REGEX_DEFECTS)[string]
    | undefined;

  it.each([false, true])(
    "serves the same schema from both paths with useNewApi: %s",
    (useNewApi) => {
      const stored = servedSchema(schemaFirst, useNewApi);
      const structured = servedSchema(codeFirst, useNewApi);
      if (defects === undefined) {
        expect(structured).toBe(stored);
      } else {
        for (const mangled of Object.keys(defects)) {
          expect(stored).toContain(mangled);
        }
        expect(structured).toBe(withoutRegexDefects(stored, defects));
      }
    },
  );
});

describe("a retained serialization", () => {
  it("orders an operation's input types as its stored schema does", () => {
    const { global } = readJson("document-drive.state.json") as {
      global: DocumentModelGlobalState;
    };
    const definition = readJson("document-drive.definition.json") as {
      specifications: {
        modules: { operations: { name: string | null }[] }[];
      }[];
    };
    const addListenerFirst = (
      modules: { operations: { name: string | null }[] }[],
    ) => {
      const owner = modules.find((module) =>
        module.operations.some(
          (operation) => operation.name === "ADD_LISTENER",
        ),
      );
      if (owner === undefined)
        throw new Error("ADD_LISTENER is not in the golden");
      owner.operations.sort(
        (left, right) =>
          Number(right.name === "ADD_LISTENER") -
          Number(left.name === "ADD_LISTENER"),
      );
    };
    addListenerFirst(global.specifications.at(-1)!.modules);
    addListenerFirst(definition.specifications.at(-1)!.modules);
    const schemaFirst = {
      documentModel: { global },
      actions: {},
    } as unknown as DocumentModelModule;
    const codeFirst = { ...schemaFirst, definition } as DocumentModelModule;
    for (const useNewApi of [false, true]) {
      expect(servedSchema(codeFirst, useNewApi)).toBe(
        servedSchema(schemaFirst, useNewApi),
      );
    }
  });
});
