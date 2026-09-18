import type { Manifest } from "types";
import { describe, expect, it } from "vitest";
import { slimManifest } from "./manifest-slim.js";

describe("slimManifest", () => {
  it("passes null/undefined through as null", () => {
    expect(slimManifest(null)).toBeNull();
    expect(slimManifest(undefined)).toBeNull();
  });

  it("keeps the summary fields the package-listing UI consumes", () => {
    const manifest: Manifest = {
      name: "@x/pkg",
      description: "A package",
      category: "tools",
      publisher: { name: "Powerhouse", url: "https://powerhouse.inc" },
      documentModels: [
        { id: "ph/doc", name: "Doc", documentTypes: ["ph/doc"] },
      ],
      editors: [{ id: "ph/editor", name: "Editor" }],
    };
    expect(slimManifest(manifest)).toEqual(manifest);
  });

  it("keeps the pieces a package ships", () => {
    const manifest: Manifest = {
      name: "@x/pkg",
      pieces: [
        { id: "@powerhousedao/piece-reactor", name: "Powerhouse Reactor" },
      ],
    };

    expect(slimManifest(manifest)).toEqual(manifest);
  });

  // `ph build` fills these in from the built piece; a listing needs them to
  // offer a piece nobody has installed yet, so they survive the slimming.
  it("keeps what ph build wrote on a piece entry and drops the rest", () => {
    const built = {
      id: "@powerhousedao/piece-paperless-ngx",
      name: "Paperless-ngx",
      version: "0.1.0",
      description: "Upload, search and tag documents.",
      bundle: "dist/node/pieces/paperless-ngx",
      descriptor: "dist/node/pieces/paperless-ngx/descriptor.json",
    };
    const manifest = {
      name: "@x/pkg",
      pieces: [
        { ...built, logoUrl: "data:image/svg+xml,...", actions: { a: {} } },
        { id: "@x/other", name: "Other", version: 3 },
      ],
    } as unknown as Manifest;

    expect(slimManifest(manifest)).toEqual({
      name: "@x/pkg",
      pieces: [built, { id: "@x/other", name: "Other" }],
    });
  });

  it("strips unknown junk fields (the 8MB agent-manifest case)", () => {
    const junk = {
      name: "ph-apeiron-cli",
      type: "clint-agent",
      serviceCommand: "ph-apeiron serve",
      features: { huge: "x".repeat(1024) },
    } as unknown as Manifest;

    expect(slimManifest(junk)).toEqual({ name: "ph-apeiron-cli" });
  });

  it("slims module entries to id/name/documentTypes and drops extras", () => {
    const manifest = {
      name: "@x/pkg",
      documentModels: [
        {
          id: "ph/doc",
          name: "Doc",
          documentTypes: ["ph/doc", 42],
          giantSpec: { everything: true },
        },
        "not-an-object",
        null,
      ],
    } as unknown as Manifest;

    expect(slimManifest(manifest)).toEqual({
      name: "@x/pkg",
      documentModels: [
        { id: "ph/doc", name: "Doc", documentTypes: ["ph/doc"] },
      ],
    });
  });

  it("tolerates malformed publisher and missing name", () => {
    const manifest = {
      publisher: "not-an-object",
    } as unknown as Manifest;
    expect(slimManifest(manifest)).toEqual({ name: "" });
  });
});
