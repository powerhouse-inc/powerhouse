import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
import {
  explainedRoots,
  listedFiles,
  tracedResolutions,
} from "../src/services/definitions/compiler-output.js";
import { canonicalPath } from "../src/services/definitions/paths.js";

const relativeTo = (root: string, file: string) =>
  relative(root, file).replaceAll("\\", "/");

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
      )
        // Captured on POSIX, where this climbs to "/" and back into the root.
        // A Windows root starts with a drive, so spell it relative to the root.
        .replaceAll(
          "../../../../../../..__ROOT__/",
          process.platform === "win32" ? "" : "../../../../../../..__ROOT__/",
        )
        .replaceAll("__ROOT__", root);
      expect(
        listedFiles(output, root).map((file) => relativeTo(root, file)),
      ).toEqual(["value.ts", "node_modules/dep/index.d.ts", "index.ts"]);
      expect(
        explainedRoots(output, root)
          .map((file) => relativeTo(root, file))
          .sort(),
      ).toEqual(["index.ts", "value.ts"]);
      expect(
        [...(tracedResolutions(output).get(join(root, "index.ts")) ?? [])].map(
          ([specifier, path]) => [specifier, relativeTo(root, path)],
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
  const file = fileURLToPath(import.meta.url);
  expect(explainedRoots(`${file}\n  ${reason}`, ".")).toEqual([file]);
});

// tsc writes \r\n line endings on Windows.
it("parses output whose lines end with \\r\\n", () => {
  const file = fileURLToPath(import.meta.url);
  expect(
    explainedRoots(`${file}\r\n  Root file specified for compilation\r\n`, "."),
  ).toEqual([file]);
  expect(listedFiles(`${file}\r\n`)).toEqual([file]);
  const resolutions = tracedResolutions(
    [
      `======== Resolving module './value.js' from '${file}'. ========`,
      `======== Module name './value.js' was successfully resolved to '${file}'. ========`,
      "",
    ].join("\r\n"),
  );
  expect(resolutions.get(canonicalPath(file))?.get("./value.js")).toBe(
    canonicalPath(file),
  );
});
