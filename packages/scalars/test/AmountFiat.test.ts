import { Kind } from "graphql";
import {
  AmountFiatScalar,
  type AmountFiat,
} from "../src/scalars/AmountFiat.js";

describe("AmountFiat Scalar", () => {
  const validAmount: AmountFiat = {
    unit: "USD",
    value: 1.5,
  };

  describe("serialization", () => {
    it("should serialize a valid AmountFiat", () => {
      expect(AmountFiatScalar.scalar.serialize(validAmount)).toEqual(
        validAmount,
      );
    });

    it("should throw an error if the value is not an object", () => {
      expect(() => AmountFiatScalar.scalar.serialize(123)).toThrow();
    });

    it("should support any currency", () => {
      expect(() =>
        AmountFiatScalar.scalar.serialize({ ...validAmount, unit: "INVALID" }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountFiatScalar.scalar.serialize({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });

    it("should throw an error if amount is not finite", () => {
      expect(() =>
        AmountFiatScalar.scalar.serialize({
          ...validAmount,
          value: Infinity,
        }),
      ).toThrow();
    });
  });

  describe("value parsing", () => {
    it("should parse a valid AmountFiat", () => {
      expect(AmountFiatScalar.scalar.parseValue(validAmount)).toEqual(
        validAmount,
      );
    });

    it("should parse valid amounts for all supported currencies", () => {
      const currencies = ["USD", "EUR", "GBP", "INVALID"];
      currencies.forEach((currency) => {
        expect(
          AmountFiatScalar.scalar.parseValue({ unit: currency, value: 1.5 }),
        ).toEqual({
          unit: currency,
          value: 1.5,
        });
      });
    });

    it("should support any currency", () => {
      expect(() =>
        AmountFiatScalar.scalar.parseValue({
          ...validAmount,
          unit: "INVALID",
        }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountFiatScalar.scalar.parseValue({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });
  });

  describe("literal parsing", () => {
    it("should parse a valid AmountFiat from literal", () => {
      expect(
        AmountFiatScalar.scalar.parseLiteral({
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
        AmountFiatScalar.scalar.parseLiteral({
          kind: Kind.FLOAT,
          value: "1.5",
        }),
      ).toThrow();
    });

    it("should throw an error if currency field is missing", () => {
      expect(() =>
        AmountFiatScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "value" },
              value: { kind: Kind.FLOAT, value: "1.5" },
            },
          ],
        }),
      ).toThrow();
    });

    it("should throw an error if amount field is missing", () => {
      expect(() =>
        AmountFiatScalar.scalar.parseLiteral({
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
        AmountFiatScalar.scalar.parseLiteral({
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
        AmountFiatScalar.scalar.parseLiteral({
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
