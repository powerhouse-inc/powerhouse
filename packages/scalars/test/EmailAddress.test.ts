import { Kind } from "graphql";
import { scalar } from "../src/scalars/EmailAddress.js";

describe("EmailAddress Scalar", () => {
  it("should serialize an email address", () => {
    const email = "test@test.com";

    expect(scalar.serialize(email)).toBe(email);
  });

  it("should throw an error if the value is not a string", () => {
    const email = 123;

    expect(() => scalar.serialize(email)).toThrow();
  });

  it("should throw an error if the value is not a valid email address", () => {
    const email = "test";

    expect(() => scalar.serialize(email)).toThrow();
  });

  it("should parse a valid email address", () => {
    const email = "test@test.com";

    expect(scalar.parseValue(email)).toBe(email);
  });

  it("should throw an error if parse a value that is not a valid email address", () => {
    const email = "test";

    expect(() => scalar.parseValue(email)).toThrow();
  });

  it("should throw an error if parse a value that is not a string", () => {
    const email = 123;

    expect(() => scalar.parseValue(email)).toThrow();
  });

  it("should parse a valid email address from a literal", () => {
    const email = "test@test.com";

    expect(
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: email,
      }),
    ).toBe(email);
  });

  it("should throw an error if parse a literal that is not a valid email address", () => {
    const email = "test";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.STRING,
        value: email,
      }),
    ).toThrow();
  });

  it("should throw an error if parse a literal that is not a string", () => {
    const email = "test";

    expect(() =>
      scalar.parseLiteral({
        kind: Kind.INT,
        value: email,
      }),
    ).toThrow();
  });
});
