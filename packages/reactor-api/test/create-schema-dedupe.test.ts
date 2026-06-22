import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { type DocumentNode, Kind, parse, print } from "graphql";
import { describe, expect, it } from "vitest";
import { getDocumentModelTypeDefs } from "../src/utils/create-schema.js";

/**
 * Regression tests for Sentry #917: a document model that defines the same
 * type/enum name twice produced duplicate definitions in the assembled subgraph
 * SDL, which crashes Apollo federation composition ("There can be only one type
 * named X"). getDocumentModelTypeDefs now dedupes type definitions keep-first.
 */

const EMPTY_TYPEDEFS: DocumentNode = { kind: Kind.DOCUMENT, definitions: [] };

const TYPE_DEFINITION_KINDS = new Set<Kind>([
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_DEFINITION,
]);

/** Build a minimal DocumentModelModule whose latest spec carries the given
 * global/local state SDL — only the fields getDocumentModelTypeDefs reads. */
function buildModel(
  name: string,
  globalSchema: string,
  localSchema = "",
): DocumentModelModule {
  return {
    documentModel: {
      global: {
        id: name,
        name,
        specifications: [
          {
            state: {
              global: { schema: globalSchema, initialValue: "" },
              local: { schema: localSchema, initialValue: "" },
            },
          },
        ],
      },
    },
  } as unknown as DocumentModelModule;
}

/** All type-system definition names in a generated DocumentNode. */
function typeDefNames(doc: DocumentNode): string[] {
  const ast = parse(print(doc));
  const names: string[] = [];
  for (const def of ast.definitions) {
    if (TYPE_DEFINITION_KINDS.has(def.kind)) {
      names.push((def as { name: { value: string } }).name.value);
    }
  }
  return names;
}

/** Names that appear more than once. */
function duplicateNames(names: string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const n of names) {
    if (seen.has(n)) dups.add(n);
    else seen.add(n);
  }
  return [...dups];
}

function countOf(names: string[], target: string): number {
  return names.filter((n) => n === target).length;
}

describe("getDocumentModelTypeDefs dedupe (Sentry #917)", () => {
  it("control: a clean model produces no duplicate type names", () => {
    const model = buildModel(
      "EmploymentDetails",
      `
        type EmploymentDetailsState {
          contractType: ContractType
        }
        enum ContractType {
          FULL_TIME
          PART_TIME
        }
      `,
    );

    const names = typeDefNames(
      getDocumentModelTypeDefs([model], EMPTY_TYPEDEFS),
    );

    expect(duplicateNames(names)).toEqual([]);
    expect(countOf(names, "EmploymentDetails_ContractType")).toBe(1);
  });

  it("global + local define the same type: deduped to a single definition", () => {
    const model = buildModel(
      "EmploymentDetails",
      `
        type EmploymentDetailsState {
          contractType: ContractType
        }
        enum ContractType {
          FULL_TIME
          PART_TIME
        }
      `,
      // local redefines the same enum name -> would collide after prefixing
      `
        enum ContractType {
          FULL_TIME
          PART_TIME
        }
      `,
    );

    const names = typeDefNames(
      getDocumentModelTypeDefs([model], EMPTY_TYPEDEFS),
    );

    expect(duplicateNames(names)).toEqual([]);
    expect(countOf(names, "EmploymentDetails_ContractType")).toBe(1);
  });

  it("state + operation schema define the same type: deduped to one", () => {
    const model = buildModel(
      "EmploymentDetails",
      `
        type EmploymentDetailsState {
          contractType: ContractType
        }
        enum ContractType {
          FULL_TIME
          PART_TIME
        }
      `,
    );

    // The subgraph's own typeDefs (operation/module schemas) arrive already
    // prefixed; simulate an operation schema redefining the state enum.
    const operationTypeDefs = parse(`
      enum EmploymentDetails_ContractType {
        FULL_TIME
        PART_TIME
      }
    `);

    const names = typeDefNames(
      getDocumentModelTypeDefs([model], operationTypeDefs),
    );

    expect(duplicateNames(names)).toEqual([]);
    expect(countOf(names, "EmploymentDetails_ContractType")).toBe(1);
  });
});
