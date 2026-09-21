import { afterEach, expect, it } from "vitest";
import { pieceRegistrySource, setPieceRegistryUrl } from "./registry-source.js";

afterEach(() => {
  setPieceRegistryUrl(undefined);
});

it("is absent until the host names a registry", () => {
  expect(pieceRegistrySource()).toBeUndefined();
  setPieceRegistryUrl("   ");
  expect(pieceRegistrySource()).toBeUndefined();
});

it("addresses the three endpoints the registry serves", () => {
  setPieceRegistryUrl("https://registry.example.com/");
  const source = pieceRegistrySource();
  expect(source?.baseUrl).toBe("https://registry.example.com");
  expect(source?.catalogUrl()).toBe("https://registry.example.com/pieces");
  expect(source?.catalogUrl(true)).toBe(
    "https://registry.example.com/pieces?suggestionType=ACTION_AND_TRIGGER",
  );
  // Encoded whole: a scoped name is one path segment to the registry's route.
  expect(source?.pieceUrl("@acme/piece-a")).toBe(
    "https://registry.example.com/pieces/%40acme%2Fpiece-a",
  );
  // Not encoded, and the slash becomes a dash: the filename their CDN serves.
  expect(source?.tarballUrl("@acme/piece-a", "1.2.3")).toBe(
    "https://registry.example.com/-/pieces/bundled/@acme-piece-a-1.2.3.tgz",
  );
});

it("follows the host when it is repointed, and forgets when it is cleared", () => {
  setPieceRegistryUrl("https://one.example.com");
  expect(pieceRegistrySource()?.baseUrl).toBe("https://one.example.com");
  setPieceRegistryUrl("https://two.example.com");
  expect(pieceRegistrySource()?.baseUrl).toBe("https://two.example.com");
  setPieceRegistryUrl(undefined);
  expect(pieceRegistrySource()).toBeUndefined();
});
