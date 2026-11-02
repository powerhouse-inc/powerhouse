import { describe, expect, it } from "vitest";
import { idTokenEmail } from "./id-token.js";

const jwt = (claims: Record<string, unknown>) =>
  [
    Buffer.from(JSON.stringify({ alg: "RS256" })).toString("base64url"),
    Buffer.from(JSON.stringify(claims)).toString("base64url"),
    "signature",
  ].join(".");

const auth = (data: Record<string, unknown>) => ({
  type: "OAUTH2",
  access_token: "a",
  data,
});

describe("idTokenEmail", () => {
  it("names the account from the ID token's verified email", () => {
    expect(
      idTokenEmail(
        auth({
          id_token: jwt({
            email: "wouter@powerhouse.inc",
            email_verified: true,
          }),
        }),
      ),
    ).toBe("wouter@powerhouse.inc");
    // A provider without email_verified is taken at its word
    expect(idTokenEmail(auth({ id_token: jwt({ email: "a@b.c" }) }))).toBe(
      "a@b.c",
    );
  });

  it("says nothing for an unverified email, no ID token, or one it cannot read", () => {
    expect(
      idTokenEmail(
        auth({ id_token: jwt({ email: "a@b.c", email_verified: false }) }),
      ),
    ).toBeUndefined();
    expect(
      idTokenEmail(
        auth({ id_token: jwt({ email: "a@b.c", email_verified: "false" }) }),
      ),
    ).toBeUndefined();
    expect(idTokenEmail(auth({}))).toBeUndefined();
    expect(idTokenEmail(auth({ id_token: "not-a-jwt" }))).toBeUndefined();
    expect(idTokenEmail(auth({ id_token: "a.%%%.c" }))).toBeUndefined();
    expect(idTokenEmail(auth({ id_token: jwt({ sub: "1" }) }))).toBeUndefined();
    expect(
      idTokenEmail({ type: "SECRET_TEXT", secret_text: "x" }),
    ).toBeUndefined();
    expect(idTokenEmail(null)).toBeUndefined();
  });
});
