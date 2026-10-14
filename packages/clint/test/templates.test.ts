import { describe, it, expect } from "vitest";
import {
  registerDefaultHelpers,
  extractTemplateVars,
  renderSkillTemplate,
} from "../src/core/templates.js";
import Handlebars from "handlebars";

describe("registerDefaultHelpers", () => {
  it("registers all 8 helpers on a Handlebars instance", () => {
    const hbs = Handlebars.create();
    registerDefaultHelpers(hbs);

    const helpers = [
      "formatDate",
      "join",
      "exists",
      "eq",
      "uppercase",
      "lowercase",
      "hasItems",
      "default",
    ];
    for (const name of helpers) {
      expect(hbs.helpers[name]).toBeDefined();
    }
  });

  describe("formatDate helper", () => {
    it("returns empty string for falsy date", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      const result = hbs.compile('{{formatDate date "time"}}', {
        noEscape: true,
      })({ date: "" });
      expect(result).toBe("");
    });

    it("formats as ISO by default", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      const result = hbs.compile('{{formatDate date "iso"}}', {
        noEscape: true,
      })({ date: "2024-01-15" });
      expect(result).toContain("2024-01-15");
    });

    it("formats as time", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      const result = hbs.compile('{{formatDate date "time"}}', {
        noEscape: true,
      })({ date: "2024-01-15T10:30:00Z" });
      expect(result.length).toBeGreaterThan(0);
    });

    it("formats as date", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      const result = hbs.compile('{{formatDate date "date"}}', {
        noEscape: true,
      })({ date: "2024-01-15" });
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe("join helper", () => {
    it("joins array with separator", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      const result = hbs.compile('{{join items ", "}}', { noEscape: true })({
        items: ["a", "b", "c"],
      });
      expect(result).toBe("a, b, c");
    });

    it("returns empty string for non-array", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      const result = hbs.compile('{{join items ", "}}', { noEscape: true })({
        items: "not-array",
      });
      expect(result).toBe("");
    });

    it("uses default separator when sep is not a string", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      // When called without explicit sep, Handlebars passes the options hash
      const result = hbs.compile("{{join items}}", { noEscape: true })({
        items: ["a", "b"],
      });
      expect(result).toBe("a, b");
    });
  });

  describe("exists helper", () => {
    it("returns true for non-empty values", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{exists val}}", { noEscape: true })({ val: "yes" }),
      ).toBe("true");
      expect(
        hbs.compile("{{exists val}}", { noEscape: true })({ val: 42 }),
      ).toBe("true");
    });

    it("returns false for falsy values", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{exists val}}", { noEscape: true })({ val: "" }),
      ).toBe("false");
      expect(
        hbs.compile("{{exists val}}", { noEscape: true })({ val: null }),
      ).toBe("false");
      expect(
        hbs.compile("{{exists val}}", { noEscape: true })({ val: undefined }),
      ).toBe("false");
    });
  });

  describe("eq helper", () => {
    it("returns true for equal values", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{eq a b}}", { noEscape: true })({ a: "x", b: "x" }),
      ).toBe("true");
    });

    it("returns false for unequal values", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{eq a b}}", { noEscape: true })({ a: "x", b: "y" }),
      ).toBe("false");
    });
  });

  describe("uppercase/lowercase helpers", () => {
    it("converts strings to uppercase", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{uppercase val}}", { noEscape: true })({ val: "hello" }),
      ).toBe("HELLO");
    });

    it("converts strings to lowercase", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{lowercase val}}", { noEscape: true })({ val: "HELLO" }),
      ).toBe("hello");
    });

    it("returns empty string for non-string input", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{uppercase val}}", { noEscape: true })({ val: 42 }),
      ).toBe("");
      expect(
        hbs.compile("{{lowercase val}}", { noEscape: true })({ val: null }),
      ).toBe("");
    });
  });

  describe("hasItems helper", () => {
    it("returns true for non-empty arrays", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{hasItems arr}}", { noEscape: true })({ arr: [1] }),
      ).toBe("true");
    });

    it("returns false for empty arrays or non-arrays", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile("{{hasItems arr}}", { noEscape: true })({ arr: [] }),
      ).toBe("false");
      expect(
        hbs.compile("{{hasItems arr}}", { noEscape: true })({
          arr: "not-array",
        }),
      ).toBe("false");
    });
  });

  describe("default helper", () => {
    it("returns value when present", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile('{{default val "fallback"}}', { noEscape: true })({
          val: "actual",
        }),
      ).toBe("actual");
    });

    it("returns default when value is empty", () => {
      const hbs = Handlebars.create();
      registerDefaultHelpers(hbs);
      expect(
        hbs.compile('{{default val "fallback"}}', { noEscape: true })({
          val: "",
        }),
      ).toBe("fallback");
      expect(
        hbs.compile('{{default val "fallback"}}', { noEscape: true })({
          val: null,
        }),
      ).toBe("fallback");
      expect(
        hbs.compile('{{default val "fallback"}}', { noEscape: true })({
          val: undefined,
        }),
      ).toBe("fallback");
    });
  });
});

describe("extractTemplateVars", () => {
  it("extracts simple variable references", () => {
    const vars = extractTemplateVars("Hello {{name}}, welcome to {{place}}!");
    expect(vars).toEqual(new Set(["name", "place"]));
  });

  it("ignores known helpers", () => {
    const vars = extractTemplateVars("{{#if active}}{{name}}{{/if}}");
    expect(vars).toEqual(new Set(["active", "name"]));
    expect(vars.has("if")).toBe(false);
  });

  it("ignores registered helpers", () => {
    const vars = extractTemplateVars("{{uppercase name}} {{join items}}");
    expect(vars).toEqual(new Set(["name", "items"]));
    expect(vars.has("uppercase")).toBe(false);
    expect(vars.has("join")).toBe(false);
  });

  it("extracts from block helper params", () => {
    const vars = extractTemplateVars("{{#each items}}{{this}}{{/each}}");
    expect(vars).toEqual(new Set(["items"]));
  });

  it("extracts from sub-expressions", () => {
    const vars = extractTemplateVars("{{#if (exists val)}}yes{{/if}}");
    expect(vars).toEqual(new Set(["val"]));
  });

  it("returns empty set for templates with no variables", () => {
    const vars = extractTemplateVars("Just plain text");
    expect(vars.size).toBe(0);
  });

  it("ignores @data references", () => {
    const vars = extractTemplateVars("{{@index}} {{name}}");
    expect(vars).toEqual(new Set(["name"]));
  });
});

describe("renderSkillTemplate", () => {
  it("renders template with context", () => {
    const { rendered, warnings } = renderSkillTemplate("Hello {{name}}!", {
      name: "World",
    });
    expect(rendered).toBe("Hello World!");
    expect(warnings).toEqual([]);
  });

  it("returns warnings for missing variables", () => {
    const { rendered, warnings } = renderSkillTemplate(
      "Hello {{name}}, your port is {{port}}!",
      { name: "World" },
    );
    expect(rendered).toBe("Hello World, your port is !");
    expect(warnings).toEqual([
      'Template references "{{port}}" but context has no value for it',
    ]);
  });

  it("does not warn for known helpers", () => {
    const { warnings } = renderSkillTemplate(
      "{{#if active}}{{uppercase name}}{{/if}}",
      { active: true, name: "test" },
    );
    expect(warnings).toEqual([]);
  });

  it("supports custom helpers", () => {
    const { rendered, warnings } = renderSkillTemplate(
      "{{double val}}",
      { val: 5 },
      { helpers: { double: (v: unknown) => Number(v) * 2 } },
    );
    expect(rendered).toBe("10");
    expect(warnings).toEqual([]);
  });

  it("does not warn for custom helper names used as references", () => {
    const { warnings } = renderSkillTemplate(
      "{{myHelper val}}",
      { val: "test" },
      { helpers: { myHelper: (v: unknown) => String(v) } },
    );
    expect(warnings).toEqual([]);
  });

  it("does not warn for extra known helpers", () => {
    // knownHelpers suppresses warnings but needs the helper registered to render
    const { warnings } = renderSkillTemplate(
      "{{customBlock val}}",
      { val: "test" },
      {
        knownHelpers: ["customBlock"],
        helpers: { customBlock: (v: unknown) => String(v) },
      },
    );
    expect(warnings).toEqual([]);
  });

  it("uses isolated Handlebars instances", () => {
    // Render with a custom helper
    renderSkillTemplate(
      "{{myHelper}}",
      {},
      { helpers: { myHelper: () => "custom" } },
    );

    // Second render should not have the helper from the first
    const { warnings } = renderSkillTemplate("{{myHelper}}", {});
    expect(warnings).toContain(
      'Template references "{{myHelper}}" but context has no value for it',
    );
  });

  it("renders block helpers correctly", () => {
    const { rendered } = renderSkillTemplate(
      "{{#each items}}{{this}} {{/each}}",
      { items: ["a", "b", "c"] },
    );
    expect(rendered).toBe("a b c ");
  });

  it("renders with noEscape (raw output)", () => {
    const { rendered } = renderSkillTemplate("{{html}}", {
      html: "<b>bold</b>",
    });
    expect(rendered).toBe("<b>bold</b>");
  });
});
