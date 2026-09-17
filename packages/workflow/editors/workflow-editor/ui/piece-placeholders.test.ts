// Activepieces ships setup instructions as markdown with placeholders the
// engine substitutes; rendered raw, they tell an author to paste "{{webhookUrl}}".
import { describe, expect, it } from "vitest";
import { fillPiecePlaceholders } from "./PropertyForm.js";

const URL = "http://localhost:4001/webhooks/3a44d1ef719306717928064f034bff61";

describe("fillPiecePlaceholders", () => {
  it("substitutes the endpoint URL, wherever it appears", () => {
    expect(
      fillPiecePlaceholders("Paste {{webhookUrl}} then save.", {
        webhookUrl: URL,
      }),
    ).toBe(`Paste ${URL} then save.`);
  });

  it("substitutes every occurrence, not just the first", () => {
    // Formspark's markdown names the URL in a fenced block and again in prose.
    const filled = fillPiecePlaceholders(
      "**Live URL:**\n```text\n{{webhookUrl}}\n```\nor {{webhookUrl}}",
      { webhookUrl: URL },
    );
    expect(filled).not.toContain("{{webhookUrl}}");
    expect(filled.match(new RegExp(URL, "g"))).toHaveLength(2);
  });

  it("tolerates the spaced spelling a piece may use", () => {
    expect(fillPiecePlaceholders("{{ webhookUrl }}", { webhookUrl: URL })).toBe(
      URL,
    );
  });

  it("names the missing endpoint rather than leaking the placeholder", () => {
    // A blank would read as though the piece needed no URL, and the raw
    // placeholder tells an author to paste "{{webhookUrl}}" into a dashboard.
    const filled = fillPiecePlaceholders("Paste {{webhookUrl}}", {});
    expect(filled).not.toContain("{{webhookUrl}}");
    expect(filled).toContain("Endpoint URL above");
  });

  it("substitutes the sync timeout, which some pieces quote", () => {
    expect(
      fillPiecePlaceholders("after {{webhookTimeoutSeconds}} seconds", {
        webhookTimeoutSeconds: 30,
      }),
    ).toBe("after 30 seconds");
  });
});
