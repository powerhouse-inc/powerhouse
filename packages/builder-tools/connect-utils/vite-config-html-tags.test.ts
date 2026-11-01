import { describe, expect, it } from "vitest";
import { getConnectHtmlTags } from "./vite-config.js";

function card(appName?: string) {
  const entries = getConnectHtmlTags({ appName }).map(({ attrs }) => [
    attrs?.property ?? attrs?.name,
    attrs?.content,
  ]);
  return Object.fromEntries(entries) as Record<string, string | undefined>;
}

describe("getConnectHtmlTags", () => {
  it("is Connect's own card without a project name", () => {
    const tags = card();
    expect(tags["og:title"]).toBe("Connect");
    expect(tags["twitter:title"]).toBe("Connect");
    expect(tags["og:url"]).toContain("apps.powerhouse.io");
    expect(tags["og:image"]).toBeDefined();
  });

  it("takes a project's name, and drops what describes Connect", () => {
    const tags = card("Sektar");
    expect(tags["og:title"]).toBe("Sektar");
    expect(tags["twitter:title"]).toBe("Sektar");
    for (const connects of [
      "og:url",
      "og:description",
      "og:image",
      "twitter:card",
      "twitter:image",
      "twitter:description",
    ]) {
      expect(tags).not.toHaveProperty(connects);
    }
  });
});
