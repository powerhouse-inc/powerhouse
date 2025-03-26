import { Kind } from "graphql";
import { AmountTokensScalar } from "../src/scalars/AmountTokens.js";

describe("AmountTokens Scalar", () => {
  it("should serialize a valid AmountTokens", () => {
    const amount = 1000.55;

    expect(AmountTokensScalar.scalar.serialize(amount)).toBe(amount);
  });

  it("should throw an error if the value is not a number", () => {
    const amount = "1000.55";

    expect(() => AmountTokensScalar.scalar.serialize(amount)).toThrow();
  });

  it("should throw an error if the value is not a valid AmountTokens", () => {
    const amount = Infinity;

    expect(() => AmountTokensScalar.scalar.serialize(amount)).toThrow();
  });

  it("should parse a valid AmountTokens", () => {
    const amount = 1000.55;

    expect(AmountTokensScalar.scalar.parseValue(amount)).toBe(amount);
  });

  it("should throw an error if parse a value that is not a valid AmountTokens", () => {
    const amount = Infinity;

    expect(() => AmountTokensScalar.scalar.parseValue(amount)).toThrow();
  });

  it("should throw an error if parse a value that is not a number", () => {
    const amount = "1000.55";

    expect(() => AmountTokensScalar.scalar.parseValue(amount)).toThrow();
  });

  it("should parse a valid AmountTokens from a literal", () => {
    const amount = 1000.55;

    expect(
      AmountTokensScalar.scalar.parseLiteral({
        kind: Kind.FLOAT,
        value: amount.toString(),
      }),
    ).toBe(amount);
  });

  it("should throw an error if parse a literal that is not a valid AmountTokens", () => {
    const amount = "test";

    expect(() =>
      AmountTokensScalar.scalar.parseLiteral({
        kind: Kind.FLOAT,
        value: amount,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a number", () => {
    const amount = "1000.55";

    expect(() =>
      AmountTokensScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: amount,
      }),
    ).toThrow();
  });
});
