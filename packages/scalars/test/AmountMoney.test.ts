import { Kind } from "graphql";
import { scalar } from "../src/scalars/AmountMoney";

describe("AmountMoney Scalar", () => {
  it("should serialize a valid AmountMoney", () => {
    const amount = 1000.55;

    expect(scalar.serialize(amount)).toBe(amount);
  });

  it("should throw an error if the value is not a number", () => {
    const amount = "1000.55";

    expect(() => scalar.serialize(amount)).toThrow();
  });

  it("should throw an error if the value is not a valid Amount", () => {
    const amount = Infinity;

    expect(() => scalar.serialize(amount)).toThrow();
  });

  it("should parse a valid Amount", () => {
    const amount = 1000.55;

    expect(scalar.parseValue(amount)).toBe(amount);
  });

  it("should throw an error if parse a value that is not a valid Amount", () => {
    const amount = Infinity;

    expect(() => scalar.parseValue(amount)).toThrow();
  });

  it("should throw an error if parse a value that is not a number", () => {
    const amount = "1000.55";

    expect(() => scalar.parseValue(amount)).toThrow();
  });

  it("should parse a valid Amount from a literal", () => {
    const amount = 1000.55;

    expect(
      scalar.parseLiteral({
        kind: Kind.FLOAT,
        value: amount.toString(),
      }),
    ).toBe(amount);
  });

  it("should throw an error if parse a literal that is not a valid Amount", () => {
    const amount = "test";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.FLOAT,
        value: amount,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a number", () => {
    const amount = "1000.55";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: amount,
      }),
    ).toThrow();
  });
});
