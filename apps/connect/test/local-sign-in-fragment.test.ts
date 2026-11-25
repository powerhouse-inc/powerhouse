import { describe, expect, it, vi } from "vitest";
import {
  pendingSignInFragment,
  readSignInFragment,
  takeSignInFragment,
  withoutSignInFragment,
} from "../src/local-sign-in-fragment.js";

describe("the sign-in link's fragment", () => {
  it("reads a code and a sign-out", () => {
    expect(readSignInFragment("#ph-sign-in=AbC-_1")).toEqual({
      kind: "sign-in",
      code: "AbC-_1",
    });
    expect(readSignInFragment("#ph-sign-out")).toEqual({ kind: "sign-out" });
    expect(readSignInFragment("#ph-sign-in=")).toBeUndefined();
    expect(readSignInFragment("")).toBeUndefined();
    expect(readSignInFragment("#studio-sign-in=token")).toBeUndefined();
  });

  it("strips only its own parameters", () => {
    expect(withoutSignInFragment("#ph-sign-in=abc")).toBe("");
    expect(withoutSignInFragment("#ph-sign-in=abc&tab=2")).toBe("#tab=2");
    expect(withoutSignInFragment("#ph-sign-out")).toBe("");
  });

  it("leaves the address bar and the history without the code, and hands it over once", () => {
    const replaceState = vi.fn();
    takeSignInFragment(
      { pathname: "/d/drive", search: "?x=1", hash: "#ph-sign-in=code1" },
      { replaceState, state: { at: 1 } },
    );
    expect(replaceState).toHaveBeenCalledWith({ at: 1 }, "", "/d/drive?x=1");
    expect(pendingSignInFragment()).toEqual({ kind: "sign-in", code: "code1" });
    expect(pendingSignInFragment()).toBeUndefined();
  });

  it("touches nothing without a sign-in fragment", () => {
    const replaceState = vi.fn();
    takeSignInFragment(
      { pathname: "/", search: "", hash: "#section" },
      { replaceState, state: null },
    );
    expect(replaceState).not.toHaveBeenCalled();
    expect(pendingSignInFragment()).toBeUndefined();
  });
});
