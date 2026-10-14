import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { expect, it } from "vitest";
import {
  explainedRoots,
  listedFiles,
  tracedResolutions,
} from "../src/services/definitions/compiler-output.js";
import { canonicalPath } from "../src/services/definitions/paths.js";

it.each(["5.9.3", "7.0.2"])(
  "parses file lists, default roots and traced resolutions from tsc %s",
  (version) => {
    const root = canonicalPath(
      mkdtempSync(join(tmpdir(), "ph-compiler-output-")),
    );
    try {
      for (const file of [
        "index.ts",
        "value.ts",
        "node_modules/dep/index.d.ts",
      ]) {
        mkdirSync(join(root, file, ".."), { recursive: true });
        writeFileSync(join(root, file), "");
      }
      const output = readFileSync(
        new URL(
          `./fixtures/compiler-output/tsc-${version}.txt`,
          import.meta.url,
        ),
        "utf8",
      ).replaceAll("__ROOT__", root);
      expect(
        listedFiles(output, root).map((file) => relative(root, file)),
      ).toEqual(["value.ts", "node_modules/dep/index.d.ts", "index.ts"]);
      expect(
        explainedRoots(output, root)
          .map((file) => relative(root, file))
          .sort(),
      ).toEqual(["index.ts", "value.ts"]);
      expect(
        [...(tracedResolutions(output).get(join(root, "index.ts")) ?? [])].map(
          ([specifier, path]) => [specifier, relative(root, path)],
        ),
      ).toEqual([
        ["#value", "value.ts"],
        ["dep", "node_modules/dep/index.d.ts"],
      ]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

it.each([
  "Part of 'files' list in tsconfig.json",
  "Root file specified for compilation",
  "Matched by include pattern '*.ts' in tsconfig.json",
])("parses explicit root wording: %s", (reason) => {
  const file = new URL("./compiler-output.test.ts", import.meta.url).pathname;
  expect(explainedRoots(`${file}\n  ${reason}`, ".")).toEqual([file]);
});
