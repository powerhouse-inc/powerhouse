import { describe, expect, it } from "vitest";
import { POWERHOUSE_DRIVE_ICON } from "../src/utils/drive-icons.js";

const PREFIX = "data:image/svg+xml,";

function decode(icon: string): string {
  return decodeURIComponent(icon.slice(PREFIX.length));
}

describe("drive icon", () => {
  it("is an inline svg data URI", () => {
    expect(POWERHOUSE_DRIVE_ICON.startsWith(PREFIX)).toBe(true);
  });

  it("fetches nothing at render time", () => {
    // The whole point: a drive icon is stored in document state, so anything
    // network-addressed becomes a broken image the day it stops resolving.
    // The one http URL allowed is the SVG namespace, which is an identifier
    // the renderer compares, never a resource it loads.
    const withoutNamespace = decode(POWERHOUSE_DRIVE_ICON).replaceAll(
      'xmlns="http://www.w3.org/2000/svg"',
      "",
    );
    expect(withoutNamespace).not.toMatch(/https?:|ipfs:|url\(/);
    // No element that could pull in an external resource either.
    expect(withoutNamespace).not.toMatch(/<(image|use|script)\b|href=/);
  });

  it("decodes to well-formed svg markup", () => {
    const svg = decode(POWERHOUSE_DRIVE_ICON);
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    // Square viewBox drawn at the 32px the sidebar renders; the coordinate
    // grid is the logo's own, so it is not asserted to be 32.
    expect(svg).toMatch(/viewBox="0 0 (\d+) \1"/);
    expect(svg).toContain('width="32"');
    expect(svg).toContain('height="32"');
  });

  it("draws the whole mark in one grey per theme", () => {
    const svg = decode(POWERHOUSE_DRIVE_ICON);
    // Every petal takes its fill from the stylesheet, so a stray fill
    // attribute would silently pin one petal to a single theme's grey.
    expect(svg).not.toMatch(/<path[^>]*fill=/);
    expect([...svg.matchAll(/<path\b/g)]).toHaveLength(4);

    const fills = [...svg.matchAll(/fill:\s*(#[0-9A-Fa-f]{6})/g)].map((m) =>
      m[1].toUpperCase(),
    );
    expect(fills).toEqual(["#404345", "#F3F5F7"]);
    for (const fill of fills) {
      // Grey means near-equal channels. The brand green (#04C161) is what
      // this must never be: a drive icon sits beside the single-tone glyphs
      // of the other drives and should not outshout them.
      const [r, g, b] = [1, 3, 5].map((i) =>
        Number.parseInt(fill.slice(i, i + 2), 16),
      );
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThan(24);
    }
  });

  it("switches greys on the embedded document's color scheme", () => {
    // An `<img>` renders the data URI as its own document, which cannot see
    // the host page's `.dark` class - the media query is the only hook the
    // theme has on it.
    const svg = decode(POWERHOUSE_DRIVE_ICON);
    expect(svg).toMatch(
      /@media \(prefers-color-scheme: dark\) \{ path \{ fill: #F3F5F7 \}/i,
    );
  });

  it("encodes the characters a URI would break on", () => {
    // An unencoded `#` truncates the URI at the fragment, silently serving a
    // partial document; `<`/`>`/`"` and the CSS braces keep it safe to paste
    // into markup too.
    const body = POWERHOUSE_DRIVE_ICON.slice(PREFIX.length);
    expect(body).not.toMatch(/[#<>"{}]/);
    expect(body).toContain("%23");
  });

  it("stays small enough to live in a drive's state", () => {
    expect(POWERHOUSE_DRIVE_ICON.length).toBeLessThan(2000);
  });
});
