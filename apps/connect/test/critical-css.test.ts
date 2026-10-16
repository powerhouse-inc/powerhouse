import { describe, expect, it } from "vitest";
import { pruneCriticalCss } from "../scripts/critical-css.ts";

// Abridged from Tailwind's minified output for the shell.
const CSS =
  "/*! tailwindcss v4.2.2 | MIT License | https://tailwindcss.com */" +
  "@layer properties{@supports (((-webkit-hyphens:none)) and (not (margin-trim:inline))){*,:before,:after{--tw-shadow:0 0 #0000;--tw-rotate-x:initial}}}" +
  "@layer theme,base,components,utilities;" +
  "@layer theme;" +
  ':root,:host{--font-sans:"Inter", sans-serif;--default-font-family:var(--font-sans);--color-gray-50:#fcfcfc;--color-red-500:red;--animate-pulse:pulse 2s infinite;--animate-spin:spin 1s infinite}' +
  ":root{--background:var(--color-gray-50);--destructive:var(--color-red-500)}" +
  ".dark{--background:#000;--destructive:#f00}" +
  "@layer base{*,:after,:before,::backdrop{box-sizing:border-box}html,:host{font-family:var(--default-font-family,ui-sans-serif)}" +
  "abbr:where([title]){text-decoration:underline dotted}table{border-collapse:collapse}" +
  "img,svg,video{display:block}button,input:where([type=button],[type=submit]){appearance:button}" +
  "::placeholder{opacity:1}@supports (not (-webkit-appearance:-apple-pay-button)){::placeholder{color:currentColor}}" +
  "[hidden]:where(:not([hidden=until-found])){display:none!important}}" +
  "@layer utilities{.bg-background{background-color:var(--background)}.shadow{--tw-shadow:0 1px #000;box-shadow:var(--tw-shadow)}.animate-pulse{animation:var(--animate-pulse)}}" +
  '@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}' +
  '@property --tw-rotate-x{syntax:"*";inherits:false}' +
  "@keyframes pulse{50%{opacity:.5}}@keyframes spin{to{transform:rotate(360deg)}}";

const MARKUP =
  '<div class="bg-background shadow"><svg viewBox="0 0 1 1"></svg>' +
  '<button type="button"><span class="animate-pulse"></span></button></div>';

describe("pruneCriticalCss", () => {
  const css = pruneCriticalCss(CSS, MARKUP);

  it("keeps the preflight for the shell's elements only", () => {
    expect(css).toContain("*,:after,:before,::backdrop{box-sizing:border-box}");
    expect(css).toContain("html,:host{");
    expect(css).toContain("svg{display:block}");
    expect(css).not.toContain("video");
    expect(css).toContain("button{appearance:button}");
    expect(css).not.toContain("abbr");
    expect(css).not.toContain("table");
    expect(css).not.toContain("::placeholder");
    expect(css).not.toContain("-apple-pay-button");
    expect(css).not.toContain("[hidden]");
  });

  it("keeps the tokens the kept rules reach, in light and dark", () => {
    expect(css).toContain(
      ':root,:host{--font-sans:"Inter", sans-serif;--default-font-family:var(--font-sans);--color-gray-50:#fcfcfc;--animate-pulse:pulse 2s infinite}',
    );
    expect(css).toContain(":root{--background:var(--color-gray-50)}");
    expect(css).toContain(".dark{--background:#000}");
    expect(css).not.toContain("--destructive");
    expect(css).not.toContain("--color-red-500");
  });

  it("keeps only the @property rules and resets in use", () => {
    expect(css).toContain("@property --tw-shadow{");
    expect(css).not.toContain("@property --tw-rotate-x");
    expect(css).toContain("*,:before,:after{--tw-shadow:0 0 #0000}");
  });

  it("keeps only the keyframes an animation names", () => {
    expect(css).toContain("@keyframes pulse{50%{opacity:.5}}");
    expect(css).not.toContain("@keyframes spin");
    expect(css).not.toContain("--animate-spin");
  });

  it("keeps a token only extra CSS reads", () => {
    expect(
      pruneCriticalCss(CSS, MARKUP, ".x{color:var(--destructive)}"),
    ).toContain(":root{--background:var(--color-gray-50);--destructive:");
  });
});
