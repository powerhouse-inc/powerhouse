// What a step leaves on disk belongs with the rest of the .ph tree: a desktop
// shell runs from the install folder and moves the tree to the signed-in
// identity's folder.
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("the runtime's folders", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("follow PH_USER_DATA_DIR", async () => {
    const identity = join("data", "identity");
    vi.stubEnv("PH_USER_DATA_DIR", identity);
    vi.resetModules();

    const lib = await import("./lib.js");

    expect(lib.bundleCacheDir()).toBe(join(identity, ".ph", "ap-bundles"));
    expect(lib.ATTACHMENT_STAGING_DIR).toBe(
      join(identity, ".ph", "ap-attachment-staging"),
    );
    expect(lib.ATTACHMENT_CACHE_DIR).toBe(
      join(identity, ".ph", "ap-attachment-cache"),
    );
  });

  it("stay in the working directory otherwise", async () => {
    vi.stubEnv("PH_USER_DATA_DIR", undefined);
    vi.resetModules();

    const lib = await import("./lib.js");

    expect(lib.bundleCacheDir()).toBe(join(process.cwd(), ".ph", "ap-bundles"));
  });
});
