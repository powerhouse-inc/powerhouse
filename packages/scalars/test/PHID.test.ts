import { Kind } from "graphql";
import { PHIDScalar } from "../src/scalars/PHID.js";

describe("PHID Scalar", () => {
  it("should serialize a valid PHID address", () => {
    const phid = "b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6";

    expect(PHIDScalar.scalar.serialize(phid)).toBe(phid);
  });

  it("should throw an error if the value is not a string", () => {
    const phid = 123;

    expect(() => PHIDScalar.scalar.serialize(phid)).toThrow();
  });

  it("should parse a valid PHID address", () => {
    const phid = "b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6";

    expect(PHIDScalar.scalar.parseValue(phid)).toBe(phid);
  });

  it("should throw an error if parse a value that is not a string", () => {
    const phid = 123;

    expect(() => PHIDScalar.scalar.parseValue(phid)).toThrow();
  });

  it("should parse a valid PHID address from a literal", () => {
    const phid = "b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6";

    expect(
      PHIDScalar.scalar.parseLiteral({
        kind: Kind.STRING,
        value: phid,
      }),
    ).toBe(phid);
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const phid = "b58f0ceb-6b6b-4cc0-9cb2-489fc86580b6";

    expect(() =>
      PHIDScalar.scalar.parseLiteral({
        kind: Kind.INT,
        value: phid,
      }),
    ).toThrow();
  });
});
