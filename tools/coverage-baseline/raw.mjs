import { createHash } from "node:crypto";
import {
  globSync,
  readFileSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";

export function archiveRaw(out, archives) {
  for (const original of globSync(["node/*.json", "browser/*/*/*.json"], {
    cwd: out,
  })) {
    const input = readFileSync(join(out, original));
    const compressed = gzipSync(input, { level: 1 });
    const archive = original + ".gz";
    writeFileSync(join(out, archive), compressed, { flag: "wx" });
    if (!gunzipSync(readFileSync(join(out, archive))).equals(input))
      throw new Error(`Raw coverage archive differs: ${original}`);
    archives.push({
      original,
      archive,
      sha256: createHash("sha256").update(input).digest("hex"),
      bytes: input.length,
      compressedBytes: compressed.length,
    });
    unlinkSync(join(out, original));
  }
  rmSync(join(out, "application-node"), { recursive: true, force: true });
}
