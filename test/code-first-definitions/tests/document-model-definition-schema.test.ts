import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Ajv } from "../src/evidence/ajv.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function json(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

describe("DocumentModelDefinitionV1 JSON Schema", () => {
  it("accepts all ten definition goldens", async () => {
    const schema = await json(
      resolve(packageRoot, "schemas/document-model-definition-v1.schema.json"),
    );
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );
    const goldenRoot = resolve(packageRoot, "fixtures/definitions/v1/goldens");
    const names = (await readdir(goldenRoot))
      .filter((name) => name.endsWith(".definition.json"))
      .sort();
    expect(names).toHaveLength(10);
    for (const name of names) {
      expect(
        validate(await json(resolve(goldenRoot, name))),
        `${name}: ${JSON.stringify(validate.errors)}`,
      ).toBe(true);
    }
  });

  it("rejects unknown top-level and nested properties", async () => {
    const schema = await json(
      resolve(packageRoot, "schemas/document-model-definition-v1.schema.json"),
    );
    const validate = new Ajv({ allErrors: true, strict: false }).compile(
      schema,
    );
    const golden = (await json(
      resolve(
        packageRoot,
        "fixtures/definitions/v1/goldens/package-e2e-todo-v1.definition.json",
      ),
    )) as {
      specifications: { state: Record<string, unknown> }[];
    } & Record<string, unknown>;

    expect(validate({ ...golden, unknown: true })).toBe(false);
    const nested = structuredClone(golden);
    nested.specifications[0]!.state.unknown = true;
    expect(validate(nested)).toBe(false);
  });
});
