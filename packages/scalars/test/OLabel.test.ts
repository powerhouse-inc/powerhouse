import { Kind } from "graphql";
import { OLabelScalar } from "../src/scalars/OLabel.js";

describe("OLabel Scalar", () => {
  it("should serialize a valid OLabel address", () => {
    const label = "some-value";

    expect(OLabelScalar.scalar.serialize(label)).toBe(label);
  });

  it("should throw an error if the value is not a string", () => {
    const label = 123;

    expect(() => OLabelScalar.scalar.serialize(label)).toThrow();
  });

  it("should parse a valid OLabel address", () => {
    const label = "some-value";

    expect(OLabelScalar.scalar.parseValue(label)).toBe(label);
  });

  it("should throw an error if parse a value that is not a string", () => {
    const label = 123;

    expect(() => OLabelScalar.scalar.parseValue(label)).toThrow();
  });

  it("should parse a valid OLabel address from a literal", () => {
    const label = "some-value";

    expect(
      OLabelScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: label,
      }),
    ).toBe(label);
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const label = "some-value";

    expect(() =>
      OLabelScalar.scalar.parseLiteral({
        kind: Kind.INT,
        value: label,
      }),
    ).toThrow();
  });
});
