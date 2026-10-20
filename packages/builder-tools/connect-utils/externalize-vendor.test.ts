import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  findPackageRoot,
  linkedBuildStamp,
  missingVendorEntries,
  prebuildConnectVendor,
  resolveOwnDeps,
  withVendorBase,
  type PrebuiltVendor,
} from "./externalize-vendor.js";

const HASHED_ZOD = /^\/__vendor__\/zod-[\w-]+\.js$/;

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
    expect(v.imports["zod"]).toMatch(HASHED_ZOD);
    expect(v.versions["zod"]).toBe(ZOD_VERSION);
    expect(v.sharedDeps).toMatch(
      /^\/__vendor__\/shared-deps-[0-9a-f]{12}\.js$/,
    );
    const modPath = join(vendorDir, v.sharedDeps.slice("/__vendor__/".length));
    expect(existsSync(modPath), "shared-deps must be emitted").toBe(true);
    expect(readFileSync(join(vendorDir, "shared-deps.js"), "utf8")).toBe(
      readFileSync(modPath, "utf8"),
    );
    const mod = (await import(pathToFileURL(modPath).href)) as {
      imports: Record<string, string>;
      versions: Record<string, string>;
    };
    // import-map.json stays base-less (the dev plugin applies the base
    // itself), but the runtime module carries it: the worker resolves these
    // against the page origin, so a base-less path would 404 on a subpath
    // deploy.
    expect(mod.imports).toEqual(withVendorBase(v.imports, "/app/"));
    expect(mod.imports["zod"]).toBe(`/app${v.imports["zod"]}`);
    expect(mod.versions).toEqual(v.versions);

    // mkdtemp stages the build at 0700 and the rename carries that mode over.
    // The build and the web server are not always the same user (root builds
    // the image, nginx serves it), and a vendor dir nobody else can traverse
    // makes every vendor URL fall through to index.html.
    // The property only exists on POSIX hosts: on win32 libuv synthesizes
    // modes (directories never get execute bits, chmod beyond read-only is
    // inert), so the assertion would be vacuous there either way. Linux CI
    // keeps asserting the real deployment property.
    if (process.platform !== "win32") {
      const mode = statSync(vendorDir).mode & 0o777;
      expect(mode & 0o055).toBe(0o055);
    }
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
    expect(v.imports["zod"]).toMatch(HASHED_ZOD);
    expect(v.versions["zod"]).toBe(ZOD_VERSION);
    const file = (url: string) =>
      join(vendorDir, url.slice("/__vendor__/".length));

    // zod's entries drop the locales namespace (it pins every locale); zod/locales keeps them.
    type ZodLike = {
      locales?: unknown;
      core: { locales?: unknown };
      string(): {
        safeParse(v: unknown): { error?: { issues: { message: string }[] } };
      };
    };
    const zod = (await import(pathToFileURL(file(v.imports["zod"])).href)) as {
      z: ZodLike;
      default: unknown;
    };
    expect("locales" in zod).toBe(false);
    expect(zod.z.locales).toBeUndefined();
    expect(zod.z.core.locales).toBeUndefined();
    expect(zod.default).toBe(zod.z);
    expect(zod.z.string().safeParse(1).error?.issues[0].message).toBe(
      "Invalid input: expected string, received number",
    );
    expect(v.imports["zod/locales"]).toMatch(
      /^\/__vendor__\/zod_locales-[\w-]+\.js$/,
    );
    const locales = (await import(
      pathToFileURL(file(v.imports["zod/locales"])).href
    )) as Record<string, unknown>;
    expect(typeof locales.fr).toBe("function");
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

const readMeta = (vendorDir: string) =>
  JSON.parse(readFileSync(join(vendorDir, "import-map.json"), "utf8")) as {
    versionDigest: string;
    base: string;
    nodeEnv: string;
  };

describe("vendor URLs are content-addressed", () => {
  it("keeps the URLs when a rebuild produces the same content", async () => {
    const vendorDir = join(dir, "stable");
    const opts = {
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir,
      nodeEnv: "production" as const,
      base: "/",
    };
    const first = (await prebuildConnectVendor(opts)) as PrebuiltVendor;
    // Not a cache hit: the dir is gone, so the vendor really builds again.
    rmSync(vendorDir, { recursive: true, force: true });
    const second = (await prebuildConnectVendor(opts)) as PrebuiltVendor;
    expect(second.imports).toEqual(first.imports);
    expect(second.sharedDeps).toBe(first.sharedDeps);
  }, 240_000);

  it("changes the URLs when the content changes", async () => {
    const dev = (await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir: join(dir, "env-dev"),
      nodeEnv: "development",
      base: "/",
    })) as PrebuiltVendor;
    const prod = (await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["zod"],
      vendorDir: join(dir, "env-prod"),
      nodeEnv: "production",
      base: "/",
    })) as PrebuiltVendor;
    // Minified vs not: same entry name, different bytes, different URL.
    expect(prod.imports["zod"]).not.toBe(dev.imports["zod"]);
  }, 240_000);
});

describe("vendored dynamic-base helpers", () => {
  it("leave a concrete base's URLs alone and resolve a dynamic build's placeholder", async () => {
    const vendorDir = join(dir, "shared-connect");
    const v = (await prebuildConnectVendor({
      dirname: DIRNAME,
      include: ["@powerhousedao/shared/connect"],
      vendorDir,
      base: "/connect/",
      nodeEnv: "production",
    })) as PrebuiltVendor;
    expect(v).not.toBeNull();
    const url = v.imports["@powerhousedao/shared/connect"];
    const mod = (await import(
      pathToFileURL(join(vendorDir, url.slice("/__vendor__/".length))).href
    )) as {
      DYNAMIC_BASE_PLACEHOLDER: string;
      resolveDynamicBaseUrl: (url: string, base: string) => string;
    };
    // The trap: the vendor build rewrites the string constant to the runtime base.
    expect(mod.DYNAMIC_BASE_PLACEHOLDER).toBe("/");
    expect(
      mod.resolveDynamicBaseUrl("/connect/__vendor__/x.js", "/connect/"),
    ).toBe("/connect/__vendor__/x.js");
    expect(mod.resolveDynamicBaseUrl("/__vendor__/x.js", "/")).toBe(
      "/__vendor__/x.js",
    );
    expect(
      mod.resolveDynamicBaseUrl(
        "/__PH_DYNAMIC_BASE__/__vendor__/x.js",
        "/app/",
      ),
    ).toBe("/app/__vendor__/x.js");
  }, 240_000);
});

describe("prebuildConnectVendor default base", () => {
  // A package with an emitted asset and a BASE_URL read, like Connect's
  // in-browser PGlite (`new URL("./pglite.data", import.meta.url)`).
  const FIXTURE = "ph-vendor-base-fixture";
  const fixtureDir = join(DIRNAME, "node_modules", FIXTURE);

  beforeAll(() => {
    mkdirSync(fixtureDir, { recursive: true });
    writeFileSync(
      join(fixtureDir, "package.json"),
      JSON.stringify({
        name: FIXTURE,
        version: "1.0.0",
        type: "module",
        exports: { ".": "./index.js" },
      }),
    );
    writeFileSync(
      join(fixtureDir, "index.js"),
      [
        `export const dataUrl = () => new URL("./fixture.data", import.meta.url).href;`,
        `export const baseUrl = import.meta.env.BASE_URL;`,
      ].join("\n"),
    );
    writeFileSync(join(fixtureDir, "fixture.data"), "x".repeat(8192));
  });
  afterAll(() => {
    rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("emits asset URLs under a single vendor segment and keeps BASE_URL at the app base", async () => {
    const vendorDir = join(dir, "default-base");
    const v = (await prebuildConnectVendor({
      dirname: DIRNAME,
      include: [FIXTURE],
      vendorDir,
    })) as PrebuiltVendor;
    expect(v).not.toBeNull();
    const entry = readFileSync(
      join(vendorDir, v.imports[FIXTURE].slice("/__vendor__/".length)),
      "utf8",
    );
    expect(entry).toMatch(/"__vendor__\/assets\/fixture-[\w-]+\.data"/);
    expect(entry).not.toContain("__vendor__/__vendor__");
    // BASE_URL is the app base: the runtime base expression, no vendor segment.
    expect(entry).not.toMatch(/baseUrl = \([^;]*__vendor__/);
  }, 240_000);
});

describe("vendor cache key", () => {
  it("rebuilds when the base or NODE_ENV changes", async () => {
    const vendorDir = join(dir, "key");
    const build = (base: string, nodeEnv: "development" | "production") =>
      prebuildConnectVendor({
        dirname: DIRNAME,
        include: ["zod"],
        vendorDir,
        base,
        nodeEnv,
      });
    await build("/", "production");
    const rootKey = readMeta(vendorDir).versionDigest;

    await build("/connect/", "production");
    const based = readMeta(vendorDir);
    expect(based.base).toBe("/connect/");
    expect(based.versionDigest).not.toBe(rootKey);

    await build("/connect/", "development");
    const dev = readMeta(vendorDir);
    expect(dev.nodeEnv).toBe("development");
    expect(dev.versionDigest).not.toBe(based.versionDigest);
  }, 480_000);
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

describe("missingVendorEntries", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "ph-vendor-verify-"));
    writeFileSync(join(dir, "zod.js"), "export const z = 1;\n");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("reports nothing when every entry has a file", () => {
    expect(missingVendorEntries(dir, { zod: "/__vendor__/zod.js" })).toEqual(
      [],
    );
  });

  // A published entry with no file becomes a bare import the app externalizes
  // onto a URL that 404s; a SPA answers that with index.html, so the browser
  // reports only an opaque MIME-type error with no filename.
  it("names an entry the build never emitted", () => {
    expect(
      missingVendorEntries(dir, {
        zod: "/__vendor__/zod.js",
        "@powerhousedao/shared/connect":
          "/__vendor__/_powerhousedao_shared_connect.js",
      }),
    ).toEqual([
      {
        spec: "@powerhousedao/shared/connect",
        url: "/__vendor__/_powerhousedao_shared_connect.js",
      },
    ]);
  });
});

describe("linkedBuildStamp", () => {
  it("ignores installed packages and follows a linked package's dist", () => {
    const installed = join(dir, "node_modules", "pkg");
    mkdirSync(join(installed, "dist"), { recursive: true });
    writeFileSync(join(installed, "dist", "index.js"), "export {};");
    expect(linkedBuildStamp(installed)).toBe("");

    const linked = join(tmpdir(), `ph-linked-${Date.now()}`, "pkg");
    expect(linkedBuildStamp(linked)).toBe("");
    const dist = join(linked, "dist");
    mkdirSync(join(dist, "hooks"), { recursive: true });
    expect(linkedBuildStamp(linked)).toBe("");

    const chunk = join(dist, "hooks", "chunk.js");
    writeFileSync(join(dist, "index.js"), "export {};");
    writeFileSync(chunk, "export {};");
    const at = (seconds: number) => new Date(seconds * 1000);
    utimesSync(join(dist, "index.js"), at(1000), at(1000));
    utimesSync(chunk, at(1000), at(1000));
    utimesSync(dist, at(1000), at(1000));
    expect(linkedBuildStamp(linked)).toBe("+dist.1000000");

    // Rebuilt in place: the nested file moves, dist's own mtime does not.
    utimesSync(chunk, at(2000), at(2000));
    utimesSync(dist, at(1000), at(1000));
    expect(statSync(dist).mtimeMs).toBe(1000000);
    expect(linkedBuildStamp(linked)).toBe("+dist.2000000");

    // Source maps and declarations never reach the vendor bundle.
    writeFileSync(join(dist, "index.js.map"), "{}");
    writeFileSync(join(dist, "index.d.ts"), "export {};");
    expect(linkedBuildStamp(linked)).toBe("+dist.2000000");
    rmSync(dirname(linked), { recursive: true, force: true });
  });
});

describe("resolveOwnDeps", () => {
  it("resolves an app's deps from the app's install dir, walking up node_modules", () => {
    const base = mkdtempSync(join(tmpdir(), "own-deps-"));
    const pkg = join(base, "node_modules", "lib");
    mkdirSync(join(pkg, "esm"), { recursive: true });
    writeFileSync(
      join(pkg, "package.json"),
      JSON.stringify({
        name: "lib",
        exports: { ".": { import: "./esm/index.js" }, "./sub": "./sub.js" },
      }),
    );
    writeFileSync(join(pkg, "esm", "index.js"), "export {};");
    writeFileSync(join(pkg, "sub.js"), "export {};");
    const app = join(base, "node_modules", "app");
    mkdirSync(app, { recursive: true });

    expect(findPackageRoot(app, "lib")).toBe(realpathSync(pkg));
    const own = resolveOwnDeps(app, [
      "lib",
      "lib/sub",
      "lib/missing",
      "absent",
    ]);
    expect(own).toEqual({
      lib: realpathSync(join(pkg, "esm", "index.js")),
      "lib/sub": realpathSync(join(pkg, "sub.js")),
    });
    rmSync(base, { recursive: true, force: true });
  });
});
