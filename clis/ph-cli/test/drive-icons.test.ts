import { describe, expect, it } from "vitest";
import {
  RETIRED_DRIVE_ICONS,
  VETRA_DRIVE_ICON,
  VETRA_PREVIEW_DRIVE_ICON,
} from "../src/utils/drive-icons.js";

const ICONS = [
  ["vetra", VETRA_DRIVE_ICON],
  ["vetra preview", VETRA_PREVIEW_DRIVE_ICON],
] as const;

describe("drive icons", () => {
  it.each(ICONS)("%s is an inline svg data URI", (_name, icon) => {
    expect(icon.startsWith("data:image/svg+xml,")).toBe(true);
  });

  it.each(ICONS)("%s fetches nothing at render time", (_name, icon) => {
    // The whole point: a drive icon is stored in document state, so anything
    // network-addressed becomes a broken image the day it stops resolving.
    // The one http URL allowed is the SVG namespace, which is an identifier
    // the renderer compares, never a resource it loads.
    const svg = decodeURIComponent(icon.slice("data:image/svg+xml,".length));
    const withoutNamespace = svg.replaceAll(
      'xmlns="http://www.w3.org/2000/svg"',
      "",
    );
    expect(withoutNamespace).not.toMatch(/https?:|ipfs:|url\(/);
    // No element that could pull in an external resource either.
    expect(withoutNamespace).not.toMatch(/<(image|use|script)\b|href=/);
  });

  it.each(ICONS)("%s decodes to well-formed svg markup", (_name, icon) => {
    const svg = decodeURIComponent(icon.slice("data:image/svg+xml,".length));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0 32 32"');
  });

  it.each(ICONS)(
    "%s encodes the characters a URI would break on",
    (_name, icon) => {
      // An unencoded `#` truncates the URI at the fragment, silently serving a
      // partial document; `<`/`>`/`"` keep it safe to paste into markup too.
      const body = icon.slice("data:image/svg+xml,".length);
      expect(body).not.toMatch(/[#<>"]/);
      expect(body).toContain("%23");
    },
  );

  it("stays small enough to live in a drive's state", () => {
    for (const [, icon] of ICONS) {
      expect(icon.length).toBeLessThan(2000);
    }
  });

  it("gives the two drives distinguishable icons", () => {
    expect(VETRA_DRIVE_ICON).not.toBe(VETRA_PREVIEW_DRIVE_ICON);
  });

  it("records the dead URLs it replaced", () => {
    expect(RETIRED_DRIVE_ICONS.length).toBeGreaterThan(0);
    for (const url of RETIRED_DRIVE_ICONS) {
      expect(url.startsWith("https://")).toBe(true);
    }
  });
});
