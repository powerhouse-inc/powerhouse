import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isPrecompressEnabled,
  precompressAssets,
} from "../src/utils/precompress.js";

const compressible = Buffer.from("postgres wasm ".repeat(20_000));

describe("precompressAssets", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "ph-precompress-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("writes decodable .gz siblings for nested wasm and data only", async () => {
    mkdirSync(join(dir, "__vendor__/assets"), { recursive: true });
    writeFileSync(join(dir, "a.wasm"), compressible);
    writeFileSync(join(dir, "__vendor__/assets/b.data"), compressible);
    writeFileSync(join(dir, "app.js"), compressible);

    const r = await precompressAssets(dir);

    expect(r).toMatchObject({ files: 2, written: 2, skipped: 0 });
    for (const f of ["a.wasm", "__vendor__/assets/b.data"]) {
      const p = join(dir, f);
      expect(gunzipSync(readFileSync(`${p}.gz`))).toEqual(compressible);
    }
    expect(existsSync(join(dir, "app.js.gz"))).toBe(false);
  });

  it("skips files that do not compress meaningfully", async () => {
    writeFileSync(join(dir, "random.wasm"), randomBytes(64 * 1024));
    const r = await precompressAssets(dir);
    expect(r).toMatchObject({ files: 1, written: 0, skipped: 1 });
    expect(existsSync(join(dir, "random.wasm.gz"))).toBe(false);
  });

  it("does not recompress fresh siblings", async () => {
    writeFileSync(join(dir, "a.wasm"), compressible);
    await precompressAssets(dir);
    const again = await precompressAssets(dir);
    expect(again).toMatchObject({ files: 1, written: 0, skipped: 1 });
  });

  it("is toggled by PH_CONNECT_PRECOMPRESS", () => {
    expect(isPrecompressEnabled({})).toBe(true);
    expect(isPrecompressEnabled({ PH_CONNECT_PRECOMPRESS: "0" })).toBe(false);
    expect(isPrecompressEnabled({ PH_CONNECT_PRECOMPRESS: "false" })).toBe(
      false,
    );
  });
});
