import { describe, expect, it } from "vitest";
import { checkDocumentModelDefinitionShape } from "../../../src/definition/compiler/wire-shape.js";
import { TaskV1 } from "../fixtures/family-model.js";
import { Invoice } from "../fixtures/invoice.js";
import { codeFirstParity } from "../fixtures/parity-model.js";

type Path = readonly (string | number)[];

function refusals(path: Path, value: unknown) {
  const definition: unknown = structuredClone(Invoice.definition);
  let owner = definition as Record<string | number, unknown>;
  for (const key of path.slice(0, -1)) {
    owner = owner[key] as Record<string | number, unknown>;
  }
  owner[path[path.length - 1]] = value;
  return checkDocumentModelDefinitionShape(definition).map(
    ({ code, path }) => ({ code, path }),
  );
}

const SPECIFICATION = ["specifications", 0] as const;

function holder(scalar: string) {
  return {
    kind: "object",
    name: "Holder",
    description: null,
    fields: [
      {
        key: "value",
        name: "value",
        description: null,
        deprecated: null,
        type: { kind: "scalar", name: scalar, required: false },
      },
    ],
  };
}

describe("checkDocumentModelDefinitionShape", () => {
  it("accepts every definition materialize attaches", () => {
    for (const module of [TaskV1, Invoice, codeFirstParity]) {
      expect(checkDocumentModelDefinitionShape(module.definition)).toEqual([]);
    }
  });

  it("refuses a member outside the closed V1 shape", () => {
    expect(refusals(["extra"], true)).toEqual([
      { code: "PH-DM-DECLARATION-INVALID", path: ["extra"] },
    ]);
  });

  it("refuses an empty specification history", () => {
    expect(refusals(["specifications"], [])).toEqual([
      { code: "PH-DM-DECLARATION-INVALID", path: ["specifications"] },
    ]);
  });

  it("refuses a state root the specification does not declare", () => {
    const at = [...SPECIFICATION, "state", "global", "root", "name"];
    expect(refusals(at, "Missing")).toEqual([
      { code: "PH-DM-DECLARATION-INVALID", path: at },
    ]);
  });

  it("refuses a scalar reference no catalog or package scalar declares", () => {
    const index = Invoice.definition.specifications[0].types.length;
    const type = [...SPECIFICATION, "types", index];
    const at = [...type, "fields", 0, "type", "name"];
    expect(refusals(type, holder("Iban"))).toEqual([
      { code: "PH-DM-DECLARATION-INVALID", path: at },
    ]);
    expect(refusals(type, holder("JSONObject"))).toEqual([
      { code: "PH-SCALAR-INTERNAL", path: at },
    ]);
  });

  it("refuses a hand-edited package scalar declaration", () => {
    const scalar = {
      name: "Iban",
      implementation: "package#Iban",
      coercionProfile: "catalog-v1",
      definition: {
        kind: "powerhouse.scalar",
        formatVersion: 1,
        name: "Iban",
        representation: "binary",
        description: "",
        coercion: { source: "derived" },
        coercionProfile: "catalog-v1",
      },
    };
    expect(refusals([...SPECIFICATION, "scalars"], [scalar])).toEqual([
      {
        code: "PH-DM-DECLARATION-INVALID",
        path: [...SPECIFICATION, "scalars", 0, "definition", "representation"],
      },
    ]);
  });
});
