import { describe, expect, it } from "vitest";
import { ConfigEntrySchema } from "./schemas.js";

describe("ConfigEntrySchema", () => {
  it("accepts a boolean entry with a true/false default", () => {
    const entry = { name: "AUTH_ENABLED", type: "boolean", default: "false" };
    expect(ConfigEntrySchema.parse(entry)).toEqual(entry);
  });

  it("accepts a boolean entry without a default", () => {
    expect(
      ConfigEntrySchema.safeParse({ name: "AUTH_ENABLED", type: "boolean" })
        .success,
    ).toBe(true);
  });

  it("names the accepted types when the type is wrong", () => {
    const result = ConfigEntrySchema.safeParse({ name: "X", type: "toggle" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["type"]);
    expect(result.error?.issues[0]?.message).toBe(
      'type must be one of "var", "secret", "boolean"',
    );
  });

  it("rejects a boolean default other than true or false", () => {
    const result = ConfigEntrySchema.safeParse({
      name: "AUTH_ENABLED",
      type: "boolean",
      default: "yes",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["default"]);
    expect(result.error?.issues[0]?.message).toBe(
      'default must be "true" or "false" for a boolean entry',
    );
  });

  it.each([
    { name: "PORT", type: "var" },
    { name: "PORT", type: "var", default: "4001", required: true },
    { name: "API_KEY", type: "secret" },
    { name: "API_KEY", type: "secret", default: "ignored" },
  ])("still accepts existing entries: $type $default", (entry) => {
    expect(ConfigEntrySchema.safeParse(entry).success).toBe(true);
  });
});
