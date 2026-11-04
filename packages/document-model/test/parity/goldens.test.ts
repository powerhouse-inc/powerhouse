import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GOLDENS, GOLDENS_DIRECTORY } from "./goldens.js";

describe("host goldens", () => {
  it.each(GOLDENS)(
    "$file is current; regenerate with pnpm exec tsx --conditions=source test/parity/regenerate.ts",
    ({ file, content }) => {
      expect(readFileSync(new URL(file, GOLDENS_DIRECTORY), "utf8")).toBe(
        content,
      );
    },
  );
});
