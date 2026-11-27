import { describe, expect, it } from "vitest";
import { withPropertyDefaults } from "../css-text.mjs";

describe("the stylesheet for a shadow root", () => {
  it("gives each registered property its initial value on every element", () => {
    const css =
      '@layer properties{}@layer utilities{.shadow{box-shadow:var(--tw-shadow)}}@property --tw-shadow{syntax:"*";inherits:false;initial-value:0 0 #0000}@property --tw-scale-x { syntax: "*"; inherits: false; initial-value: 1; }@property --tw-rotate-x{syntax:"*";inherits:false}';
    expect(withPropertyDefaults(css)).toBe(
      `@layer properties;${css}\n@layer properties{*,:before,:after,::backdrop{--tw-shadow:0 0 #0000;--tw-scale-x:1}}`,
    );
  });

  it("writes a zero length with its unit, so calc() can add it to a length", () => {
    const css =
      '@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:0}@property --tw-translate-x{syntax:"*";inherits:false;initial-value:0}';
    expect(withPropertyDefaults(css)).toContain(
      "{--tw-ring-offset-width:0px;--tw-translate-x:0}",
    );
  });

  it("leaves a stylesheet without registered properties as it is", () => {
    expect(withPropertyDefaults(".a{color:red}")).toBe(".a{color:red}");
  });
});
