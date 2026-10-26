import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";
import { BUILT_PIECE_LIST } from "../src/packages/pieces.js";
import { ignoreBuildOutputButPieces } from "../src/packages/vite-loader.mjs";

describe("the package loader's build-output filter", () => {
  const root = join(tmpdir(), "ph-loader-watch");
  const at = (path: string) => join(root, path);
  const pieces = dirname(at(BUILT_PIECE_LIST));

  it("ignores the project's build output, but the built piece list", () => {
    const ignored = ignoreBuildOutputButPieces(root);

    expect(ignored(at("dist/assets/index-abc.js"))).toBe(true);
    expect(ignored(at("dist/browser/editor.js"))).toBe(true);
    expect(ignored(at("hosts/desktop/tauri-shell/target/debug/app.exe"))).toBe(
      true,
    );
    expect(ignored(at(BUILT_PIECE_LIST))).toBe(false);
    expect(ignored(pieces)).toBe(false);
    expect(ignored(dirname(pieces))).toBe(false);
  });

  it("leaves the source tree watched", () => {
    const ignored = ignoreBuildOutputButPieces(root);

    expect(ignored(at("processors/email-index/processor.ts"))).toBe(false);
    expect(ignored(at("dist"))).toBe(false);
    expect(ignored(at("distro/notes.md"))).toBe(false);
  });
});
