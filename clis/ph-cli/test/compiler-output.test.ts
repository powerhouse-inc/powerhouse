import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import {
  explainedRoots,
  listedFiles,
} from "../src/services/definitions/compiler-output.js";
import {
  cleanUp,
  compileFixture,
  fixtureRuns,
  relativeTo,
  writeJson,
} from "./compile-fixture.js";

const itWithFixture = it.skipIf(!fixtureRuns);

afterEach(cleanUp);

itWithFixture.each(["5.9.3", "7.0.2"] as const)(
  "parses the file list and roots tsc %s prints",
  (typescript) => {
    const { root } = compileFixture({ typescript });
    const dep = join(root, "node_modules", "dep");
    mkdirSync(dep);
    writeJson(join(dep, "package.json"), { name: "dep", types: "index.d.ts" });
    writeFileSync(join(dep, "index.d.ts"), "export declare const dep: 1;\n");
    writeFileSync(
      join(root, "index.ts"),
      'export type { Shape } from "./src/shape.js";\nexport { dep } from "dep";\n',
    );
    writeJson(join(root, "tsconfig.json"), {
      compilerOptions: {
        module: "nodenext",
        target: "esnext",
        noEmit: true,
        types: [],
      },
    });
    const output = execFileSync(
      join(root, "node_modules", ".bin", "tsc"),
      ["-p", root, "--listFilesOnly", "--explainFiles", "--pretty", "false"],
      { encoding: "utf8" },
    );
    const inPackage = (files: string[]) =>
      relativeTo(root, files).filter((file) => !file.startsWith(".."));
    expect({
      files: inPackage(listedFiles(output, root)),
      roots: inPackage(explainedRoots(output, root)),
    }).toEqual({
      files: ["src/shape.ts", "node_modules/dep/index.d.ts", "index.ts"],
      roots: ["src/shape.ts", "index.ts"],
    });
  },
  60_000,
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
});
