import { describe, expect, it } from "vitest";
import {
  chipsOf,
  CORE_CHIP,
  orderChips,
  POWERHOUSE_CHIP,
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

  it("pins Core and Powerhouse, then AI, then the rest by piece count", () => {
    const pieces = [
      { categories: ["MARKETING"] },
      { categories: ["MARKETING", "COMMUNICATION"] },
      { categories: ["ARTIFICIAL_INTELLIGENCE"] },
      { categories: [] },
    ];
    expect(orderChips(pieces)).toEqual([
      CORE_CHIP,
      POWERHOUSE_CHIP,
      "AI",
      "Marketing",
      "Communication",
    ]);
    // Both built-in chips are pinned whatever the catalog holds.
    expect(orderChips([{ categories: ["COMMERCE"] }])).toEqual([
      CORE_CHIP,
      POWERHOUSE_CHIP,
      "Commerce",
    ]);
  });
});
