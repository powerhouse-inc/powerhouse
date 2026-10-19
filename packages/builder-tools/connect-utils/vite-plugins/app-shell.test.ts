import { describe, expect, it } from "vitest";
import { injectAppShell } from "./app-shell.js";

const shell = {
  body: `<div data-ph-shell style="display:contents"><div class="h-screen"></div></div>`,
  head: `<style data-ph-shell>.h-screen{height:100vh}</style>`,
};

const html = [
  `<!doctype html><html><head>`,
  `<link rel="stylesheet" crossorigin href="/assets/index-abc.css">`,
  `</head><body><div id="root"></div></body></html>`,
].join("");

describe("injectAppShell", () => {
  it("fills #root, inlines the critical CSS and defers the stylesheet", () => {
    const out = injectAppShell(html, shell);
    expect(out).toContain(`<div id="root">${shell.body}</div>`);
    // Ahead of the stylesheet, so the full CSS wins equal-specificity rules.
    expect(out.indexOf(shell.head)).toBeGreaterThan(0);
    expect(out.indexOf(shell.head)).toBeLessThan(out.indexOf("index-abc.css"));
    expect(out).toContain(
      `<link rel="preload" as="style" crossorigin href="/assets/index-abc.css" onload="this.onload=null;this.rel='stylesheet'">`,
    );
    expect(out).toContain(
      `<noscript><link rel="stylesheet" crossorigin href="/assets/index-abc.css"></noscript>`,
    );
  });

  it("applies once and leaves a page without an empty root alone", () => {
    const once = injectAppShell(html, shell);
    expect(injectAppShell(once, shell)).toBe(once);
    const filled = html.replace(
      `<div id="root"></div>`,
      `<div id="root">x</div>`,
    );
    expect(injectAppShell(filled, shell)).toBe(filled);
  });
});
