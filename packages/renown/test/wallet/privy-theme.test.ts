import { describe, expect, it } from "vitest";
import { toPrivyAccentColor } from "../../src/wallet/privy/theme.js";

describe("toPrivyAccentColor", () => {
  it("passes hex through", () => {
    expect(toPrivyAccentColor("#0084ff")).toBe("#0084ff");
    expect(toPrivyAccentColor("#08f")).toBe("#08f");
    expect(toPrivyAccentColor("  #0084FF  ")).toBe("#0084FF");
  });

  // What a host actually supplies: getComputedStyle normalizes to rgb().
  it("converts the rgb() a resolved CSS token yields", () => {
    expect(toPrivyAccentColor("rgb(0, 132, 255)")).toBe("#0084ff");
    expect(toPrivyAccentColor("rgb(255 255 255)")).toBe("#ffffff");
  });

  it("drops alpha, which Privy derives itself", () => {
    expect(toPrivyAccentColor("rgba(0, 132, 255, 0.5)")).toBe("#0084ff");
  });

  it("clamps and rounds out-of-range channels", () => {
    expect(toPrivyAccentColor("rgb(-20, 132.6, 300)")).toBe("#0085ff");
  });

  // Privy rejects anything non-hex, so an unconvertible color must be omitted
  // rather than forwarded.
  it("returns undefined when it cannot produce hex", () => {
    expect(toPrivyAccentColor(undefined)).toBeUndefined();
    expect(toPrivyAccentColor("")).toBeUndefined();
    expect(toPrivyAccentColor("rebeccapurple")).toBeUndefined();
    expect(toPrivyAccentColor("var(--primary)")).toBeUndefined();
    expect(toPrivyAccentColor("hsl(210 100% 50%)")).toBeUndefined();
  });
});
