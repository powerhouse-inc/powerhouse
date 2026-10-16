import { afterEach, describe, expect, it } from "vitest";
import { bindPHStoreToWindow, createPHStore } from "../src/hooks/ph-store.js";
import {
  extractDriveSlugFromPath,
  getPathWithoutBase,
} from "../src/utils/url.js";

function withBasePath(basePath: string | undefined) {
  bindPHStoreToWindow(createPHStore({ basePath }));
}

describe("getPathWithoutBase", () => {
  afterEach(() => withBasePath(undefined));

  it("strips a leading base path", () => {
    withBasePath("/connect/");
    expect(getPathWithoutBase("/connect/d/drive/doc")).toBe("/d/drive/doc");
    expect(getPathWithoutBase("/connect/")).toBe("/");
  });

  it("leaves the base path inside the path alone", () => {
    withBasePath("/connect/");
    expect(getPathWithoutBase("/d/connect/doc")).toBe("/d/connect/doc");
    expect(getPathWithoutBase("/app/connect/d/x")).toBe("/app/connect/d/x");
    expect(extractDriveSlugFromPath("/d/connect/")).toBe("connect");
  });

  it("strips a base path without a trailing slash only at a segment end", () => {
    withBasePath("/connect");
    expect(getPathWithoutBase("/connect/d/drive")).toBe("/d/drive");
    expect(getPathWithoutBase("/connector/d/drive")).toBe("/connector/d/drive");
  });

  it("keeps the path under the root base path", () => {
    withBasePath("/");
    expect(getPathWithoutBase("/d/drive")).toBe("/d/drive");
  });
});
