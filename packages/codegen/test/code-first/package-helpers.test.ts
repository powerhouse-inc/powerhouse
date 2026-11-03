import type * as childProcess from "node:child_process";
import type * as nodePath from "node:path";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { tree, typeCheck } from "./package.js";

const execution = vi.hoisted<{ error?: Error }>(() => ({}));

vi.mock("node:path", async (importOriginal) => {
  const actual = await importOriginal<typeof nodePath>();
  return { ...actual, relative: actual.win32.relative };
});

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof childProcess>();
  return {
    ...actual,
    execFileSync(
      file: string,
      args: readonly string[],
      options: childProcess.ExecFileSyncOptionsWithStringEncoding,
    ) {
      if (execution.error !== undefined) throw execution.error;
      if (/[\\/]\.bin[\\/]tsc$/.test(file)) {
        throw new Error("Windows cannot execute the POSIX tsc shim.");
      }
      return actual.execFileSync(file, args, options);
    },
  };
});

let dir: string;
beforeEach(() => {
  execution.error = undefined;
  dir = mkdtempSync(join(tmpdir(), "ph-test-helpers-"));
  writeFileSync(
    join(dir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: { strict: true, noEmit: true, types: [] },
      files: ["index.ts"],
    }),
  );
  writeFileSync(join(dir, "index.ts"), "export const value: string = 'ok';\n");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

it("uses portable snapshot keys with Windows relative paths", () => {
  mkdirSync(join(dir, "nested"));
  writeFileSync(join(dir, "nested/child.ts"), "export {};\n");
  expect(tree(dir)["nested/child.ts"]).toBe("export {};\n");
  expect(Object.keys(tree(dir)).some((path) => path.includes("\\"))).toBe(
    false,
  );
});

it("runs the real compiler without a platform-specific executable shim", () => {
  expect(typeCheck(dir)).toBe("");
});

it("fails when generated TypeScript does not compile", () => {
  writeFileSync(join(dir, "index.ts"), "export const value: string = 1;\n");
  expect(() => typeCheck(dir)).toThrow();
});

it("preserves a compiler launch failure", () => {
  const error = new Error("Compiler process could not start.");
  execution.error = error;
  expect(() => typeCheck(dir)).toThrow(error);
});
