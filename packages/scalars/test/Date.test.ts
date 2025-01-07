import { Kind } from "graphql";
import { scalar } from "../src/scalars/Date";

describe("Date Scalar", () => {
  it("should serialize a valid Date", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(scalar.serialize(date)).toBe(date);
  });

  it("should throw an error if the value is not a string", () => {
    const date = 123;

    expect(() => scalar.serialize(date)).toThrow();
  });

  it("should throw an error if the value is not a valid date", () => {
    const date = "test";

    expect(() => scalar.serialize(date)).toThrow();
  });

  it("should parse a valid date", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(scalar.parseValue(date)).toBe(date);
  });

  it("should throw an error if parse a value that is not a valid date", () => {
    const date = "===!!2024-11-01T00:00:00.000Z";

    expect(() => scalar.parseValue(date)).toThrow();
  });

  it("should throw an error if parse a value that is not a string", () => {
    const date = 123;

    expect(() => scalar.parseValue(date)).toThrow();
  });

  it("should parse a valid date from a literal", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: date,
      }),
    ).toBe(date);
  });

  it("should throw an error if parse a literal that is not a valid date", () => {
    const date = "====!!!2024-11-01T00:00:00.000Z";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: date,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.INT,
        value: date,
      }),
    ).toThrow();
  });
});
