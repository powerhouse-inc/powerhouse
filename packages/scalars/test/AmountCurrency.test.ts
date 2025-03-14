import { Kind } from "graphql";
import { scalar, type AmountCurrency } from "../src/scalars/AmountCurrency.js";

describe("AmountCurrency Scalar", () => {
  const validAmount: AmountCurrency = {
    unit: "USD",
    value: 1.5,
  };

  describe("serialization", () => {
    it("should serialize a valid AmountCurrency", () => {
      expect(scalar.serialize(validAmount)).toEqual(validAmount);
    });

    it("should throw an error if the value is not an object", () => {
      expect(() => scalar.serialize(123)).toThrow();
    });

    it("should throw an error if currency is not valid", () => {
      expect(() =>
        scalar.serialize({ ...validAmount, unit: "INVALID" }),
      ).toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        scalar.serialize({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });

    it("should throw an error if amount is not finite", () => {
      expect(() =>
        scalar.serialize({ ...validAmount, value: Infinity }),
      ).toThrow();
    });
  });

  describe("value parsing", () => {
    it("should parse a valid AmountCurrency", () => {
      expect(scalar.parseValue(validAmount)).toEqual(validAmount);
    });

    it("should parse valid amounts for all supported currencies", () => {
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
        expect(scalar.parseValue({ unit: currency, value: 1.5 })).toEqual({
          unit: currency,
          value: 1.5,
        });
      });
    });

    it("should throw an error if currency is not supported", () => {
      expect(() =>
        scalar.parseValue({ ...validAmount, unit: "INVALID" }),
      ).toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        scalar.parseValue({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });
  });

  describe("literal parsing", () => {
    it("should parse a valid AmountCurrency from literal", () => {
      expect(
        scalar.parseLiteral({
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
              value: { kind: Kind.FLOAT, value: "1.5" },
            },
          ],
        }),
      ).toEqual(validAmount);
    });

    it("should throw an error if literal is not an object", () => {
      expect(() =>
        scalar.parseLiteral({
          kind: Kind.FLOAT,
          value: "1.5",
        }),
      ).toThrow();
    });

    it("should throw an error if currency field is missing", () => {
      expect(() =>
        scalar.parseLiteral({
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
        scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.ENUM, value: "USD" },
            },
          ],
        }),
      ).toThrow();
    });

    it("should throw an error if currency is not a valid enum", () => {
      expect(() =>
        scalar.parseLiteral({
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
        scalar.parseLiteral({
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
