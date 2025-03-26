import { Kind } from "graphql";
import {
  AmountCurrencyScalar,
  type AmountCurrency,
} from "../src/scalars/AmountCurrency.js";

describe("AmountCurrency Scalar", () => {
  const validAmount: AmountCurrency = {
    unit: "USD",
    value: 1.5,
  };

  describe("serialization", () => {
    it("should serialize a valid AmountCurrency", () => {
      expect(AmountCurrencyScalar.scalar.serialize(validAmount)).toEqual(
        validAmount,
      );
    });

    it("should throw an error if the value is not an object", () => {
      expect(() => AmountCurrencyScalar.scalar.serialize(123)).toThrow();
    });

    it("should support any string currency", () => {
      expect(() =>
        AmountCurrencyScalar.scalar.serialize({ ...validAmount, unit: "BTC" }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountCurrencyScalar.scalar.serialize({
          ...validAmount,
          value: "1.5",
        }),
      ).toThrow();
    });

    it("should throw an error if amount is not finite", () => {
      expect(() =>
        AmountCurrencyScalar.scalar.serialize({
          ...validAmount,
          value: Infinity,
        }),
      ).toThrow();
    });
  });

  describe("value parsing", () => {
    it("should parse a valid AmountCurrency", () => {
      expect(AmountCurrencyScalar.scalar.parseValue(validAmount)).toEqual(
        validAmount,
      );
    });

    it("should parse valid amounts for all currencies", () => {
      const currencies = [
        "USD",
        "EUR",
        "GBP",
        "DAI",
        "ETH",
        "MKR",
        "SKY",
        "USDC",
        "USDS",
      ];
      currencies.forEach((currency) => {
        expect(
          AmountCurrencyScalar.scalar.parseValue({
            unit: currency,
            value: 1.5,
          }),
        ).toEqual({
          unit: currency,
          value: 1.5,
        });
      });
    });

    it("should support any string currency", () => {
      expect(() =>
        AmountCurrencyScalar.scalar.parseValue({
          ...validAmount,
          unit: "INVALID",
        }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountCurrencyScalar.scalar.parseValue({
          ...validAmount,
          value: "1.5",
        }),
      ).toThrow();
    });
  });

  describe("literal parsing", () => {
    it("should parse a valid AmountCurrency from literal", () => {
      expect(
        AmountCurrencyScalar.scalar.parseLiteral({
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
        AmountCurrencyScalar.scalar.parseLiteral({
          kind: Kind.FLOAT,
          value: "1.5",
        }),
      ).toThrow();
    });

    it("should throw an error if currency field is missing", () => {
      expect(() =>
        AmountCurrencyScalar.scalar.parseLiteral({
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
        AmountCurrencyScalar.scalar.parseLiteral({
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
        AmountCurrencyScalar.scalar.parseLiteral({
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
        AmountCurrencyScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.ENUM, value: "USD" },
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
