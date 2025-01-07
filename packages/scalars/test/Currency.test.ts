import { Kind } from "graphql";
import { scalar } from "../src/scalars/Currency";

describe("Currency Scalar", () => {
  it("should serialize a valid Currency", () => {
    const currency = "USD";

    expect(scalar.serialize(currency)).toBe(currency);
  });

  it("should throw an error if the value is not a string", () => {
    const currency = 123;

    expect(() => scalar.serialize(currency)).toThrow();
  });

  it("should parse a valid Currency", () => {
    const currency = "USD";

    expect(scalar.parseValue(currency)).toBe(currency);
  });

  it("should throw an error if parse a value that is not a string", () => {
    const currency = 123;

    expect(() => scalar.parseValue(currency)).toThrow();
  });

  it("should parse a valid Currency from a literal", () => {
    const currency = "USD";

    expect(
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: currency,
      }),
    ).toBe(currency);
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const currency = "USD";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.INT,
        value: currency,
      }),
    ).toThrow();
  });
});
