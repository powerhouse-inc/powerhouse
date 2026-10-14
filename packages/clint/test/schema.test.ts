import { describe, it, expect } from "vitest";
import { z } from "zod";
import { getSchemaFields, slugToTitle } from "../src/core/schema.js";

describe("getSchemaFields", () => {
  it("extracts fields from a ZodObject", () => {
    const schema = z.object({
      name: z.string().describe("A name"),
      count: z.number().default(1).describe("Count"),
    });
    const fields = getSchemaFields(schema);
    expect(fields).toHaveLength(2);
    expect(fields[0]!.key).toBe("name");
    expect(fields[1]!.key).toBe("count");
  });

  it("returns empty array for non-object schemas", () => {
    expect(getSchemaFields(z.string())).toEqual([]);
    expect(getSchemaFields(z.number())).toEqual([]);
  });

  it("detects required string fields", () => {
    const schema = z.object({ name: z.string().describe("Name") });
    const [field] = getSchemaFields(schema);
    expect(field!.isOptional).toBe(false);
    expect(field!.hasDefault).toBe(false);
    expect(field!.defaultValue).toBeUndefined();
    expect(field!.baseType).toBe("string");
    expect(field!.description).toBe("Name");
  });

  it("detects optional fields", () => {
    const schema = z.object({ tag: z.string().optional().describe("Tag") });
    const [field] = getSchemaFields(schema);
    expect(field!.isOptional).toBe(true);
    expect(field!.hasDefault).toBe(false);
    expect(field!.baseType).toBe("string");
  });

  it("detects fields with defaults", () => {
    const schema = z.object({
      loud: z.boolean().default(false).describe("Shout"),
    });
    const [field] = getSchemaFields(schema);
    expect(field!.isOptional).toBe(true);
    expect(field!.hasDefault).toBe(true);
    expect(field!.defaultValue).toBe(false);
    expect(field!.baseType).toBe("boolean");
    expect(field!.description).toBe("Shout");
  });

  it("detects number fields with defaults", () => {
    const schema = z.object({ count: z.number().default(42) });
    const [field] = getSchemaFields(schema);
    expect(field!.hasDefault).toBe(true);
    expect(field!.defaultValue).toBe(42);
    expect(field!.baseType).toBe("number");
  });

  it("detects nullable fields", () => {
    const schema = z.object({ value: z.string().nullable() });
    const [field] = getSchemaFields(schema);
    expect(field!.baseType).toBe("string");
  });

  it("handles fields without descriptions", () => {
    const schema = z.object({ bare: z.string() });
    const [field] = getSchemaFields(schema);
    expect(field!.description).toBeUndefined();
  });

  it("unwraps nested wrappers (optional + default)", () => {
    const schema = z.object({
      value: z.boolean().default(true),
    });
    const [field] = getSchemaFields(schema);
    expect(field!.baseType).toBe("boolean");
    expect(field!.hasDefault).toBe(true);
    expect(field!.defaultValue).toBe(true);
  });
});

describe("slugToTitle", () => {
  it("converts kebab-case to Title Case", () => {
    expect(slugToTitle("document-modeling")).toBe("Document Modeling");
  });

  it("handles single word", () => {
    expect(slugToTitle("hello")).toBe("Hello");
  });

  it("handles multi-word slug", () => {
    expect(slugToTitle("fusion-project-management")).toBe(
      "Fusion Project Management",
    );
  });
});
