import { Kind } from "graphql";
import { AmountPercentageScalar } from "../src/scalars/AmountPercentage.js";

describe("AmountPercentage Scalar", () => {
  it("should serialize a valid AmountPercentage", () => {
    const percentage = 77.32;

    expect(AmountPercentageScalar.scalar.serialize(percentage)).toBe(
      percentage,
    );
  });

  it("should throw an error if the value is not a number", () => {
    const percentage = "77.32";

    expect(() => AmountPercentageScalar.scalar.serialize(percentage)).toThrow();
  });

  it("should throw an error if the value is not a valid AmountPercentage", () => {
    const percentage = Infinity;

    expect(() => AmountPercentageScalar.scalar.serialize(percentage)).toThrow();
  });

  it("should parse a valid AmountPercentage", () => {
    const percentage = 77.32;

    expect(AmountPercentageScalar.scalar.parseValue(percentage)).toBe(
      percentage,
    );
  });

  it("should throw an error if parse a value that is not a valid AmountPercentage", () => {
    const percentage = Infinity;

    expect(() =>
      AmountPercentageScalar.scalar.parseValue(percentage),
    ).toThrow();
  });

  it("should throw an error if parse a value that is not a number", () => {
    const percentage = "77.32";

    expect(() =>
      AmountPercentageScalar.scalar.parseValue(percentage),
    ).toThrow();
  });

  it("should parse a valid AmountPercentage from a literal", () => {
    const percentage = 77.32;

    expect(
      AmountPercentageScalar.scalar.parseLiteral({
        kind: Kind.FLOAT,
        value: percentage.toString(),
      }),
    ).toBe(percentage);
  });

  it("should throw an error if parse a literal that is not a valid AmountPercentage", () => {
    const percentage = "test";

    expect(() =>
      AmountPercentageScalar.scalar.parseLiteral({
        kind: Kind.FLOAT,
        value: percentage,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a number", () => {
    const percentage = "77.32";

    expect(() =>
      AmountPercentageScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: percentage,
      }),
    ).toThrow();
  });
});
