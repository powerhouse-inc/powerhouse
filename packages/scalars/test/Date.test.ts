import { Kind } from "graphql";
import { DateScalar } from "../src/scalars/Date.js";

describe("Date Scalar", () => {
  it("should serialize a valid Date", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(DateScalar.scalar.serialize(date)).toBe(date);
  });

  it("should throw an error if the value is not a string", () => {
    const date = 123;

    expect(() => DateScalar.scalar.serialize(date)).toThrow();
  });

  it("should throw an error if the value is not a valid date", () => {
    const date = "test";

    expect(() => DateScalar.scalar.serialize(date)).toThrow();
  });

  it("should parse a valid date", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(DateScalar.scalar.parseValue(date)).toBe(date);
  });

  it("should throw an error if parse a value that is not a valid date", () => {
    const date = "===!!2024-11-01T00:00:00.000Z";

    expect(() => DateScalar.scalar.parseValue(date)).toThrow();
  });

  it("should throw an error if parse a value that is not a string", () => {
    const date = 123;

    expect(() => DateScalar.scalar.parseValue(date)).toThrow();
  });

  it("should parse a valid date from a literal", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(
      DateScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: date,
      }),
    ).toBe(date);
  });

  it("should throw an error if parse a literal that is not a valid date", () => {
    const date = "====!!!2024-11-01T00:00:00.000Z";

    expect(() =>
      DateScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: date,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(() =>
      DateScalar.scalar.parseLiteral({
        kind: Kind.INT,
        value: date,
      }),
    ).toThrow();
  });
});
