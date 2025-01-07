import { Kind } from "graphql";
import { scalar } from "../src/scalars/EthereumAddress";

describe("EthereumAddress Scalar", () => {
  it("should serialize a valid Ethereum address", () => {
    const address = "0x675B4a9fcF67cD9D0FDFF2431eDB030C3e592913";

    expect(scalar.serialize(address)).toBe(address);
  });

  it("should throw an error if the value is not a string", () => {
    const address = 123;

    expect(() => scalar.serialize(address)).toThrow();
  });

  it("should throw an error if the value is not a valid Ethereum address", () => {
    const address = "test";

    expect(() => scalar.serialize(address)).toThrow();
  });

  it("should parse a valid URL address", () => {
    const address = "0x675B4a9fcF67cD9D0FDFF2431eDB030C3e592913";

    expect(scalar.parseValue(address)).toBe(address);
  });

  it("should throw an error if parse a value that is not a valid Ethereum address", () => {
    const address = "test";

    expect(() => scalar.parseValue(address)).toThrow();
  });

  it("should throw an error if parse a value that is not a string", () => {
    const address = 123;

    expect(() => scalar.parseValue(address)).toThrow();
  });

  it("should parse a valid Ethereum address from a literal", () => {
    const address = "0x675B4a9fcF67cD9D0FDFF2431eDB030C3e592913";

    expect(
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: address,
      }),
    ).toBe(address);
  });

  it("should throw an error if parse a literal that is not a valid Ethereum address", () => {
    const address = "test";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: address,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const address = "0x675B4a9fcF67cD9D0FDFF2431eDB030C3e592913";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.INT,
        value: address,
      }),
    ).toThrow();
  });
});
