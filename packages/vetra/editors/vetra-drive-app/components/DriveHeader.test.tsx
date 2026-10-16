import {
  bindPHStoreToWindow,
  createPHStore,
} from "@powerhousedao/reactor-browser";
import { describe, expect, it, vi } from "vitest";
import { makeDriveShareUrl } from "./DriveHeader.js";

// setupTests mocks reactor-browser; the base path needs the real store.
vi.unmock("@powerhousedao/reactor-browser");

const driveUrl = "https://switchboard.example/d/vetra";

// Each test binds its own store, so none sees another's base path.
describe("makeDriveShareUrl", () => {
  it("keeps the host's base path", () => {
    bindPHStoreToWindow(createPHStore({ basePath: "/connect/" }));
    const url = new URL(makeDriveShareUrl(driveUrl));
    expect(url.pathname).toBe("/connect/");
    expect(url.searchParams.get("driveUrl")).toBe(driveUrl);
  });

  it("links to the app root with the drive url", () => {
    bindPHStoreToWindow(createPHStore());
    const url = new URL(makeDriveShareUrl(driveUrl));
    expect(url.origin).toBe(window.location.origin);
    expect(url.pathname).toBe("/");
    expect(url.searchParams.get("driveUrl")).toBe(driveUrl);
  });

  it("is empty for a missing or invalid drive url", () => {
    expect(makeDriveShareUrl("")).toBe("");
    expect(makeDriveShareUrl("not a url")).toBe("");
  });
});
