import { Kind } from "graphql";
import { type Amount, AmountScalar } from "../src/scalars/Amount.js";

describe("Amount Scalar", () => {
  const validAmount: Amount = {
    unit: "USD",
    value: 1.5,
  };

  describe("serialization", () => {
    it("should serialize a valid Amount", () => {
      expect(AmountScalar.scalar.serialize(validAmount)).toEqual(validAmount);
    });

    it("should throw an error if the value is not an object", () => {
      expect(() => AmountScalar.scalar.serialize(123)).toThrow();
    });

    it("should not throw an error if currency is not valid", () => {
      expect(() =>
        AmountScalar.scalar.serialize({ ...validAmount, unit: "INVALID" }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountScalar.scalar.serialize({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });

    it("should throw an error if amount is not finite", () => {
      expect(() =>
        AmountScalar.scalar.serialize({ ...validAmount, value: Infinity }),
      ).toThrow();
    });

    it("should not throw an error if unit is missing", () => {
      expect(() => AmountScalar.scalar.serialize({ value: 1.5 })).not.toThrow();
    });
  });

  describe("value parsing", () => {
    it("should parse a valid Amount", () => {
      expect(AmountScalar.scalar.parseValue(validAmount)).toEqual(validAmount);
    });

    it("should parse valid amounts for all supported currencies", () => {
      const currencies = ["USD", "MKR", "CLP", "ANOTHER_CURRENCY"];
      currencies.forEach((currency) => {
        expect(
          AmountScalar.scalar.parseValue({ unit: currency, value: 1.5 }),
        ).toEqual({
          unit: currency,
          value: 1.5,
        });
      });
    });

    it("should not throw an error if currency is not supported", () => {
      expect(() =>
        AmountScalar.scalar.parseValue({ ...validAmount, unit: "INVALID" }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountScalar.scalar.parseValue({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });

    it("should not throw an error if unit is missing", () => {
      expect(() =>
        AmountScalar.scalar.parseValue({ value: 1.5 }),
      ).not.toThrow();
    });
  });

  describe("literal parsing", () => {
    it("should parse a valid Amount from literal", () => {
      expect(
        AmountScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.STRING, value: "USD" },
            },
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "value" },
              value: { kind: Kind.FLOAT, value: "1.5" },
            },
          ],
        }),
      ).toEqual(validAmount);
    });

    it("should throw an error if literal is not an object", () => {
      expect(() =>
        AmountScalar.scalar.parseLiteral({
          kind: Kind.FLOAT,
          value: "1.5",
        }),
      ).toThrow();
    });

    it("should not throw an error if currency field is missing", () => {
      expect(() =>
        AmountScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "value" },
              value: { kind: Kind.FLOAT, value: "1.5" },
            },
          ],
        }),
      ).not.toThrow();
    });

    it("should throw an error if amount field is missing", () => {
      expect(() =>
        AmountScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.STRING, value: "USD" },
            },
          ],
        }),
      ).toThrow();
    });

    it("should throw an error if currency is not a valid string", () => {
      expect(() =>
        AmountScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.ENUM, value: "INVALID" },
            },
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "value" },
              value: { kind: Kind.FLOAT, value: "1.5" },
            },
          ],
        }),
      ).toThrow();
    });

    it("should throw an error if amount is not a float", () => {
      expect(() =>
        AmountScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.STRING, value: "USD" },
            },
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "value" },
              value: { kind: Kind.STRING, value: "1.5" },
            },
          ],
        }),
      ).toThrow();
    });
  });
});
