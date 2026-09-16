import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  prebuildConnectVendor,
  withVendorBase,
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
    // import-map.json stays base-less (the dev plugin applies the base
    // itself), but the runtime module carries it: the worker resolves these
    // against the page origin, so a base-less path would 404 on a subpath
    // deploy.
    expect(mod.imports).toEqual(withVendorBase(v.imports, "/app/"));
    expect(mod.imports["zod"]).toBe("/app/__vendor__/zod.js");
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

describe("withVendorBase", () => {
  const raw = { "document-model": "/__vendor__/document_model.js" };

  it("rebases onto a root deploy base", () => {
    expect(withVendorBase(raw, "/__vendor__/")["document-model"]).toBe(
      "/__vendor__/document_model.js",
    );
  });

  // The worker resolves these against the page origin, so a base-less path
  // would request /__vendor__/... and 404 on a subpath deploy.
  it("rebases onto a subpath deploy base", () => {
    expect(withVendorBase(raw, "/connect/__vendor__/")["document-model"]).toBe(
      "/connect/__vendor__/document_model.js",
    );
  });

  it("keeps the dynamic-base placeholder for the runtime to substitute", () => {
    expect(
      withVendorBase(raw, "/__PH_DYNAMIC_BASE__/__vendor__/")["document-model"],
    ).toBe("/__PH_DYNAMIC_BASE__/__vendor__/document_model.js");
  });

  it("never emits a doubled slash", () => {
    for (const base of ["/__vendor__/", "/connect/__vendor__/"]) {
      for (const v of Object.values(withVendorBase(raw, base))) {
        expect(v).not.toMatch(/[^:]\/\//);
      }
    }
  });
});
