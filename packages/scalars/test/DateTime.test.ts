import { Kind } from "graphql";
import { DateTimeScalar } from "../src/scalars/DateTime.js";

describe("DateTime Scalar", () => {
  it("should serialize a valid DateTime", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(DateTimeScalar.scalar.serialize(date)).toBe(date);
  });

  it("should throw an error if the value is not a string", () => {
    const date = 123;

    expect(() => DateTimeScalar.scalar.serialize(date)).toThrow();
  });

  it("should throw an error if the value is not a valid datetime", () => {
    const date = "test";

    expect(() => DateTimeScalar.scalar.serialize(date)).toThrow();
  });

  it("should parse a valid datetime", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(DateTimeScalar.scalar.parseValue(date)).toBe(date);
  });

  it("should throw an error if parse a value that is not a valid datetime", () => {
    const date = "===!!2024-11-01T00:00:00.000Z";

    expect(() => DateTimeScalar.scalar.parseValue(date)).toThrow();
  });

  it("should throw an error if parse a value that is not a string", () => {
    const date = 123;

    expect(() => DateTimeScalar.scalar.parseValue(date)).toThrow();
  });

  it("should parse a valid datetime from a literal", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(
      DateTimeScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: date,
      }),
    ).toBe(date);
  });

  it("should throw an error if parse a literal that is not a valid datetime", () => {
    const date = "====!!!2024-11-01T00:00:00.000Z";

    expect(() =>
      DateTimeScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: date,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const date = "2024-11-01T00:00:00.000Z";

    expect(() =>
      DateTimeScalar.scalar.parseLiteral({
        kind: Kind.INT,
        value: date,
      }),
    ).toThrow();
  });
});
