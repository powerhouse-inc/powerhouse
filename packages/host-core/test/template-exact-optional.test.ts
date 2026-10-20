import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * `$map` templates under exactOptionalPropertyTypes, which generated
 * hosts/tsconfig.json enables (this package does not, so the check compiles
 * a fixture with tsc). An optional template slot is omitted,
 * never written as `undefined` (a host file is JSON); a token that may
 * produce `undefined` still fills it. Every `@ts-expect-error` in the
 * fixture must be used, so the negative cases are checked too.
 */

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), "../src");
const require_ = createRequire(import.meta.url);
const ZOD_DIR = path.dirname(require_.resolve("zod/package.json"));
const TSC = path.join(
  path.dirname(require_.resolve("typescript/package.json")),
  "bin",
  "tsc",
);

const FIXTURE = `
import type { z } from "zod";
import type { declaredHostSchemas } from ${JSON.stringify(`${SRC}/host-schemas.js`)};
import type { ItemToken, Template } from ${JSON.stringify(`${SRC}/tokens.js`)};

type Drive = { slug: string; name?: string; remote?: { url: string } };
const maybeName: ItemToken<string | undefined> = { $item: ["name"] };

export const omitted: Template<Drive> = { slug: "s" };
export const tokenMayBeUndefined: Template<Drive> = { slug: "s", name: maybeName };
// @ts-expect-error -- an optional slot is omitted, never set to undefined
export const explicitUndefined: Template<Drive> = { slug: "s", name: undefined };
// @ts-expect-error -- nested optional slots too
export const nestedUndefined: Template<Drive> = { slug: "s", remote: undefined };

type DeclaredHost = z.input<typeof declaredHostSchemas.reactorHostSchema>;
export const host: DeclaredHost = {
  name: "x",
  runner: { module: "m" },
  reactor: {
    // @ts-expect-error -- a drive template's name is omitted, not undefined
    drives: {
      $map: {
        over: { $output: { host: "sb", path: ["drives"] } },
        to: { slug: { $key: true }, name: undefined },
      },
    },
  },
};
`;

const temporary: string[] = [];
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

describe("$map templates under exactOptionalPropertyTypes", () => {
  it("reject an explicit undefined in an optional slot and accept a token that may produce one", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ph-template-exact-"));
    temporary.push(dir);
    // The fixture's own `zod` import resolves from its folder.
    symlinkSync(path.dirname(ZOD_DIR), path.join(dir, "node_modules"), "dir");
    const file = path.join(dir, "fixture.ts");
    writeFileSync(file, FIXTURE);
    const run = spawnSync(
      process.execPath,
      [
        TSC,
        "--noEmit",
        "--pretty",
        "false",
        "--strict",
        "--exactOptionalPropertyTypes",
        "--skipLibCheck",
        "--module",
        "nodenext",
        "--moduleResolution",
        "nodenext",
        "--target",
        "es2022",
        file,
      ],
      { cwd: dir, encoding: "utf8" },
    );
    // Only the fixture's diagnostics: host-core's own sources are not
    // written for exactOptionalPropertyTypes.
    const errors = `${run.stdout}${run.stderr}`
      .split("\n")
      .filter((line) => /error TS\d+/.test(line))
      .filter((line) => line.includes("fixture.ts"));
    expect(errors).toEqual([]);
  }, 60_000);
});
