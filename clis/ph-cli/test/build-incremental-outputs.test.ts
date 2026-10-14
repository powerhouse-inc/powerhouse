import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import * as compiler from "../src/services/definitions/compiler.js";
import { build, cleanUp, prepack } from "./helpers/declarations.js";
import { plainCompile, addReference } from "./helpers/workspace.js";
import { incrementalDeclarations } from "./helpers/incremental-declarations.js";

afterEach(cleanUp);

it.each(["code-first", "schema-first"] as const)(
  "restores deleted incremental declarations for %s",
  async (flow) => {
    const root = incrementalDeclarations(flow);
    expect((await build(root, flow)).exitCode).toBe(0);
    const declaration = join(root, "dist/types/index.d.ts");
    const before = readFileSync(declaration, "utf8");
    rmSync(join(root, "dist"), { recursive: true });
    expect(existsSync(join(root, "tsconfig.tsbuildinfo"))).toBe(true);
    const plain = plainCompile(root);
    expect(plain.status, plain.output).toBe(0);
    expect(existsSync(declaration)).toBe(false);
    const commands = vi.spyOn(compiler, "runLocal");
    const rebuilt = await build(root, flow);
    expect(rebuilt.exitCode, rebuilt.log).toBe(0);
    expect(
      commands.mock.calls
        .map(([, , args]) => args)
        .filter((args) => args[1] === "--build"),
    ).toEqual([["tsc", "--build", "--force"]]);
    expect(existsSync(declaration)).toBe(true);
    expect(readFileSync(declaration, "utf8")).toBe(before);
    expect(existsSync(join(root, "dist/types/index.d.ts.map"))).toBe(true);
    if (flow === "code-first") {
      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(0);
      expect(retained.log).toContain("Reusing the completed release check");
      expect(retained.phases).toEqual([]);
    }
  },
  120_000,
);

it("keeps the normal incremental compile command identical to main", async () => {
  const root = incrementalDeclarations("code-first");
  expect((await build(root, "code-first")).exitCode).toBe(0);
  const commands = vi.spyOn(compiler, "runLocal");
  const result = await build(root, "code-first");
  expect(result.exitCode, result.log).toBe(0);
  expect(
    commands.mock.calls
      .map(([, , args]) => args)
      .filter((args) => args[1] === "--build"),
  ).toEqual([["tsc", "--build"]]);
}, 120_000);

it("restores a reference's missing runtime and declarations with surviving build info", async () => {
  const root = incrementalDeclarations("code-first");
  addReference(root, join(root, "lib"), {
    compilerOptions: {
      outDir: "../dist/lib",
      tsBuildInfoFile: "lib.tsbuildinfo",
    },
  });
  expect((await build(root, "code-first")).exitCode).toBe(0);
  rmSync(join(root, "dist"), { recursive: true });
  expect(existsSync(join(root, "lib/lib.tsbuildinfo"))).toBe(true);
  const result = await build(root, "code-first");
  expect(result.exitCode, result.log).toBe(0);
  expect(readFileSync(join(root, "dist/lib/index.js"), "utf8")).toBe(
    "export const value = 42;\n",
  );
  expect(readFileSync(join(root, "dist/lib/index.d.ts"), "utf8")).toBe(
    "export declare const value = 42;\n",
  );
  expect((await prepack(root)).log).toContain(
    "Reusing the completed release check",
  );
}, 120_000);
