import { describe, expect, it } from "vitest";
import {
  checkSignInCode,
  LOCAL_SIGN_IN_CODE_TTL_MS,
  LOCAL_SIGN_IN_PARAM,
  mintSignInCode,
  newSignInSecret,
  opensBrowser,
  signInLink,
} from "./local-sign-in.js";

const ORIGIN = "http://localhost:3000";

describe("sign-in codes", () => {
  it("hold for the secret and origin they were minted for, until they expire", () => {
    const secret = newSignInSecret();
    const now = 1_000_000;
    const code = mintSignInCode(secret, ORIGIN, { now });
    expect(checkSignInCode(secret, code, ORIGIN, now)).toMatchObject({
      ok: true,
      expiresAt: now + LOCAL_SIGN_IN_CODE_TTL_MS,
    });
    expect(checkSignInCode(secret, code, "http://LOCALHOST:3000", now).ok).toBe(
      true,
    );
    expect(
      checkSignInCode(secret, code, ORIGIN, now + LOCAL_SIGN_IN_CODE_TTL_MS),
    ).toEqual({ ok: false, reason: "expired-code" });
  });

  it("refuse another secret, another origin, a changed byte and junk", () => {
    const secret = newSignInSecret();
    const code = mintSignInCode(secret, ORIGIN);
    const bad = { ok: false, reason: "bad-code" };
    expect(checkSignInCode(newSignInSecret(), code, ORIGIN)).toEqual(bad);
    expect(checkSignInCode(secret, code, "http://localhost:3001")).toEqual(bad);
    expect(checkSignInCode(secret, code, "http://127.0.0.1:3000")).toEqual(bad);
    const bytes = Buffer.from(code, "base64url");
    bytes[20] ^= 1;
    expect(
      checkSignInCode(secret, bytes.toString("base64url"), ORIGIN),
    ).toEqual(bad);
    expect(checkSignInCode(secret, "", ORIGIN)).toEqual(bad);
    expect(checkSignInCode(secret, "not a code!", ORIGIN)).toEqual(bad);
  });

  it("are new for each link, which keeps the app's path", () => {
    const secret = newSignInSecret();
    const link = new URL(signInLink(`${ORIGIN}/d/drive-1`, secret));
    expect(link.pathname).toBe("/d/drive-1");
    const params = new URLSearchParams(link.hash.slice(1));
    const code = params.get(LOCAL_SIGN_IN_PARAM)!;
    expect(checkSignInCode(secret, code, ORIGIN).ok).toBe(true);
    expect(signInLink(ORIGIN, secret)).not.toBe(signInLink(ORIGIN, secret));
  });
});

describe("opensBrowser", () => {
  it("opens as asked, else on a terminal outside CI, never with BROWSER=none", () => {
    expect(opensBrowser({ isTTY: true, env: {} })).toBe(true);
    expect(opensBrowser({ isTTY: false, env: {} })).toBe(false);
    expect(opensBrowser({ isTTY: true, env: { CI: "1" } })).toBe(false);
    expect(opensBrowser({ asked: true, isTTY: false, env: {} })).toBe(true);
    expect(opensBrowser({ asked: false, isTTY: true, env: {} })).toBe(false);
    expect(
      opensBrowser({ asked: true, isTTY: true, env: { BROWSER: "none" } }),
    ).toBe(false);
  });
});
