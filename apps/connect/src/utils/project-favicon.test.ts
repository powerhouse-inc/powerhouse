// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { applyProjectFavicons } from "./project-favicon.js";

const config = (appVariants?: unknown) => ({
  connect: { icons: appVariants === undefined ? {} : { appVariants } },
});

describe("applyProjectFavicons", () => {
  beforeEach(() => {
    document.head.innerHTML = '<link rel="icon" href="/icon.ico">';
  });

  it("replaces the static icon.ico with the project's sized icons", () => {
    const applied = applyProjectFavicons(
      config([
        { size: 16, src: "data:image/png;base64,AA" },
        { size: 64, src: "data:image/png;base64,BB" },
      ]),
    );
    expect(applied).toBe(true);
    const links = [
      ...document.head.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'),
    ];
    // the static link is gone, so no browser can prefer it
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "data:image/png;base64,AA",
      "data:image/png;base64,BB",
    ]);
    expect(links.map((l) => l.getAttribute("sizes"))).toEqual([
      "16x16",
      "64x64",
    ]);
  });

  it("leaves the static icon alone without project icons", () => {
    expect(applyProjectFavicons(config())).toBe(false);
    expect(applyProjectFavicons(config("nope"))).toBe(false);
    expect(applyProjectFavicons(undefined)).toBe(false);
    expect(
      document.head.querySelector('link[rel~="icon"]')?.getAttribute("href"),
    ).toBe("/icon.ico");
  });

  it("is idempotent: a second call does not stack links", () => {
    const c = config([{ size: 32, src: "data:image/png;base64,CC" }]);
    applyProjectFavicons(c);
    applyProjectFavicons(c);
    expect(document.head.querySelectorAll('link[rel~="icon"]')).toHaveLength(1);
  });
});
