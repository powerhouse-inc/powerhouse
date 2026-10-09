import { describe, expect, it } from "vitest";
import {
  categoriesOfChip,
  chipsOf,
  inTab,
  matchesQuery,
  orderChips,
  queryTokens,
} from "./BlockSelector.js";

describe("category chips", () => {
  it("maps Activepieces categories to chip labels, merging AI variants", () => {
    expect([
      ...chipsOf({ categories: ["ARTIFICIAL_INTELLIGENCE", "UNIVERSAL_AI"] }),
    ]).toEqual(["AI"]);
    expect([...chipsOf({ categories: ["CORE", "FLOW_CONTROL"] })]).toEqual([
      "Utilities",
    ]);
    expect([
      ...chipsOf({ categories: ["SALES_AND_CRM", "NEW_THING"] }),
    ]).toEqual(["Sales & CRM", "New thing"]);
  });

  it("puts AI first, then the rest by piece count", () => {
    const pieces = [
      { categories: ["MARKETING"] },
      { categories: ["MARKETING", "COMMUNICATION"] },
      { categories: ["ARTIFICIAL_INTELLIGENCE"] },
      { categories: [] },
    ];
    expect(orderChips(pieces)).toEqual(["AI", "Marketing", "Communication"]);
    expect(orderChips([{ categories: ["COMMERCE"] }])).toEqual(["Commerce"]);
  });

  it("sends every category id a chip stands for", () => {
    const pieces = [
      { categories: ["ARTIFICIAL_INTELLIGENCE"] },
      { categories: ["UNIVERSAL_AI", "MARKETING"] },
    ];
    expect(categoriesOfChip("AI", pieces).sort()).toEqual([
      "ARTIFICIAL_INTELLIGENCE",
      "UNIVERSAL_AI",
    ]);
  });
});

describe("source tabs", () => {
  it("lists registry and package pieces under Powerhouse", () => {
    expect(inTab("powerhouse", { source: "registry" })).toBe(true);
    expect(inTab("powerhouse", { source: "local" })).toBe(true);
    expect(inTab("powerhouse", { source: "activepieces" })).toBe(false);
    expect(inTab("activepieces", { source: "registry" })).toBe(false);
    expect(inTab("all", { source: "registry" })).toBe(true);
    expect(inTab("core", { source: "local" })).toBe(false);
  });

  it("reads a piece without a source as an Activepieces one", () => {
    expect(inTab("activepieces", {})).toBe(true);
    expect(inTab("powerhouse", {})).toBe(false);
  });
});

describe("client-side filter", () => {
  it("matches every token, in any order", () => {
    const tokens = queryTokens("Sheets  google");
    expect(tokens).toEqual(["sheets", "google"]);
    expect(matchesQuery("Google Sheets", tokens)).toBe(true);
    expect(matchesQuery("Google Docs", tokens)).toBe(false);
    expect(matchesQuery("anything", queryTokens(""))).toBe(true);
  });
});
