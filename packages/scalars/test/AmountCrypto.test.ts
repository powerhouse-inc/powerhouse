import { Kind } from "graphql";
import {
  AmountCryptoScalar,
  type AmountCrypto,
} from "../src/scalars/AmountCrypto.js";

describe("AmountCrypto Scalar", () => {
  const validAmount: AmountCrypto = {
    unit: "ETH",
    value: 1.5,
  };

  describe("serialization", () => {
    it("should serialize a valid AmountCrypto", () => {
      expect(AmountCryptoScalar.scalar.serialize(validAmount)).toEqual(
        validAmount,
      );
    });

    it("should throw an error if the value is not an object", () => {
      expect(() => AmountCryptoScalar.scalar.serialize(123)).toThrow();
    });

    it("should support any string as currency", () => {
      expect(() =>
        AmountCryptoScalar.scalar.serialize({
          ...validAmount,
          unit: "INVALID",
        }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountCryptoScalar.scalar.serialize({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });

    it("should throw an error if amount is not finite", () => {
      expect(() =>
        AmountCryptoScalar.scalar.serialize({
          ...validAmount,
          value: Infinity,
        }),
      ).toThrow();
    });
  });

  describe("value parsing", () => {
    it("should parse a valid AmountCrypto", () => {
      expect(AmountCryptoScalar.scalar.parseValue(validAmount)).toEqual(
        validAmount,
      );
    });

    it("should parse valid amounts for all supported currencies", () => {
      const currencies = [
        "DAI",
        "ETH",
        "MKR",
        "SKY",
        "USDC",
        "USDS",
        "INVALID",
      ];
      currencies.forEach((currency) => {
        expect(
          AmountCryptoScalar.scalar.parseValue({ unit: currency, value: 1.5 }),
        ).toEqual({
          unit: currency,
          value: 1.5,
        });
      });
    });

    it("should support any string as currency", () => {
      expect(() =>
        AmountCryptoScalar.scalar.parseValue({
          ...validAmount,
          unit: "INVALID",
        }),
      ).not.toThrow();
    });

    it("should throw an error if amount is not a number", () => {
      expect(() =>
        AmountCryptoScalar.scalar.parseValue({ ...validAmount, value: "1.5" }),
      ).toThrow();
    });
  });

  describe("literal parsing", () => {
    it("should parse a valid AmountCrypto from literal", () => {
      expect(
        AmountCryptoScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.STRING, value: "ETH" },
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
        AmountCryptoScalar.scalar.parseLiteral({
          kind: Kind.FLOAT,
          value: "1.5",
        }),
      ).toThrow();
    });

    it("should throw an error if currency field is missing", () => {
      expect(() =>
        AmountCryptoScalar.scalar.parseLiteral({
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
        AmountCryptoScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.STRING, value: "ETH" },
            },
          ],
        }),
      ).toThrow();
    });

    it("should throw an error if currency is not a valid string", () => {
      expect(() =>
        AmountCryptoScalar.scalar.parseLiteral({
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
        AmountCryptoScalar.scalar.parseLiteral({
          kind: Kind.OBJECT,
          fields: [
            {
              kind: Kind.OBJECT_FIELD,
              name: { kind: Kind.NAME, value: "unit" },
              value: { kind: Kind.STRING, value: "ETH" },
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
