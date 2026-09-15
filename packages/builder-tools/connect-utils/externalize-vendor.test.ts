import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  prebuildConnectVendor,
  type PrebuiltVendor,
} from "./externalize-vendor.js";

// The real dev context is the fixture: apps/connect resolves vite + zod,
// exactly where the dev plugin calls prebuildConnectVendor.
const ROOT = join(__dirname, "../../..");
const DIRNAME = join(ROOT, "apps/connect");
// Same resolution walk the implementation uses: under pnpm-strict layouts
// zod is not in the project's first-level node_modules.
const REQ = createRequire(join(DIRNAME, "noop.js"));
const ZOD_VERSION = (() => {
  let d = dirname(REQ.resolve("zod"));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(d, "package.json"))) {
      // Named-const cast: we just located the package.json we own.
      const meta = JSON.parse(
        readFileSync(join(d, "package.json"), "utf8"),
      ) as { version?: string };
      return meta.version ?? "unknown";
    }
    const p = dirname(d);
    if (p === d) break;
    d = p;
  }
  throw new Error("zod package root not found");
})();

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(DIRNAME, "node_modules/.ph-vendor-test-"));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("prebuildConnectVendor production options", () => {
  it("builds with explicit base + production nodeEnv and emits shared-deps.js with versions", async () => {
    const vendorDir = join(dir, "prod");
    const result = await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir,
      base: "/app/",
      nodeEnv: "production",
    });
    expect(result, "vendor build should succeed").not.toBeNull();
    const v = result as PrebuiltVendor;
    // Import-map values stay base-relative; the consumer prefixes the base.
    expect(v.imports["zod"]).toBe("/__vendor__/zod.js");
    expect(v.versions["zod"]).toBe(ZOD_VERSION);
    const modPath = join(vendorDir, "shared-deps.js");
    expect(existsSync(modPath), "shared-deps.js must be emitted").toBe(true);
    const mod = (await import(pathToFileURL(modPath).href)) as {
      imports: Record<string, string>;
      versions: Record<string, string>;
    };
    expect(mod.imports).toEqual(v.imports);
    expect(mod.versions).toEqual(v.versions);
  }, 240_000);

  it("keeps dev behavior with defaults (no base/nodeEnv)", async () => {
    const vendorDir = join(dir, "dev");
    const result = await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir,
    });
    expect(result, "vendor build should succeed").not.toBeNull();
    const v = result as PrebuiltVendor;
    expect(v.imports["zod"]).toBe("/__vendor__/zod.js");
    expect(v.versions["zod"]).toBe(ZOD_VERSION);
  }, 240_000);

  it("serves a cache hit on an identical second call", async () => {
    const vendorDir = join(dir, "cache");
    const first = await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir,
    });
    const second = await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir,
    });
    expect(second).not.toBeNull();
    expect(second).toEqual(first);
  }, 240_000);
});
