import {
  prepack,
  build,
  cleanUp,
  packageWith,
  writeTsconfig,
  type Flow,
  itWithSymlinks,
} from "./helpers/declarations.js";
import { addReference } from "./helpers/workspace.js";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  readlinkSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { createGenerationSteps } from "../src/services/definitions/build-steps.js";

afterEach(cleanUp);

describe.each<Flow>(["code-first", "schema-first"])(
  "%s retained compiler output",
  (flow) => {
    it("keeps referenced JS, declarations, maps, build info and unrelated bytes, while cleaning bundle subtrees", async () => {
      const root = packageWith(flow);
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      addReference(root, "lib", {
        compilerOptions: {
          outDir: "../dist/lib",
          sourceMap: true,
          declarationMap: true,
          tsBuildInfoFile: "../dist/lib/tsconfig.tsbuildinfo",
        },
        files: ["index.ts"],
      });
      mkdirSync(join(root, "dist", "browser"), { recursive: true });
      mkdirSync(join(root, "dist", "node"), { recursive: true });
      writeFileSync(join(root, "dist", "keep.txt"), "retained\n");
      for (const dir of ["browser", "node"])
        writeFileSync(join(root, "dist", dir, "stale.js"), "stale\n");
      const steps = await createGenerationSteps();
      let checked = false;
      const result = await build(root, flow, "dist", {
        ...steps,
        verifyPackedConsumers: async (request) => {
          expect(
            readFileSync(
              join(request.candidateRoot, "lib", "index.d.ts"),
              "utf8",
            ),
          ).toBe(
            "export declare const value = 42;\n//# sourceMappingURL=index.d.ts.map",
          );
          checked = true;
          return await steps.verifyPackedConsumers(request);
        },
      });
      expect(result.exitCode, result.log).toBe(0);
      expect(checked).toBe(flow === "code-first");
      expect(readFileSync(join(root, "dist", "keep.txt"), "utf8")).toBe(
        "retained\n",
      );
      expect(readFileSync(join(root, "dist", "lib", "index.js"), "utf8")).toBe(
        "export const value = 42;\n//# sourceMappingURL=index.js.map",
      );
      for (const file of [
        "index.d.ts",
        "index.js.map",
        "index.d.ts.map",
        "tsconfig.tsbuildinfo",
      ])
        expect(existsSync(join(root, "dist", "lib", file))).toBe(true);
      for (const dir of ["browser", "node"])
        expect(existsSync(join(root, "dist", dir, "stale.js"))).toBe(false);
    }, 120_000);

    it("keeps declarations of deleted sources inside the output directory", async () => {
      const root = packageWith(flow);
      writeTsconfig(root, {
        declaration: true,
        declarationDir: "dist/types",
      });
      writeFileSync(join(root, "src", "gone.ts"), "export type Gone = true;\n");
      expect((await build(root, flow)).exitCode).toBe(0);
      rmSync(join(root, "src", "gone.ts"));
      expect((await build(root, flow)).exitCode).toBe(0);
      expect(
        readFileSync(join(root, "dist", "types", "src", "gone.d.ts"), "utf8"),
      ).toBe("export type Gone = true;\n");
    }, 120_000);

    it("publishes the root compiler's JavaScript at its configured outDir", async () => {
      const root = packageWith(flow);
      writeTsconfig(root, {
        declaration: true,
        outDir: "dist",
        emitDeclarationOnly: false,
      });
      const result = await build(root, flow);
      expect(result.exitCode, result.log).toBe(0);
      expect(readFileSync(join(root, "dist", "index.js"), "utf8")).toBe(
        flow === "code-first"
          ? 'export { invoiceFamily } from "./src/invoice.js";\n'
          : "export const ready = true;\n",
      );
    }, 120_000);
  },
);

it.each(["changed", "deleted"])(
  "invalidates prepack reuse when an ignored reference declaration outside the output is %s",
  async (change) => {
    const root = packageWith("code-first");
    writeTsconfig(root, { declaration: true, declarationDir: "types" });
    addReference(root, "lib", {
      compilerOptions: {
        outDir: "../generated/lib",
        sourceMap: true,
        declarationMap: true,
        tsBuildInfoFile: "../generated/lib/tsconfig.tsbuildinfo",
      },
      files: ["index.ts"],
    });
    spawnSync("git", ["init", "--quiet"], { cwd: root });
    writeFileSync(join(root, ".gitignore"), "generated/\ntypes/\n");
    const built = await build(root, "code-first");
    expect(built.exitCode, built.log).toBe(0);
    const file = join(root, "generated", "lib", "index.d.ts");
    if (change === "changed")
      writeFileSync(file, "export declare const value: never;\n");
    else rmSync(file);
    const result = await prepack(root);
    expect(result.exitCode, result.log).toBe(0);
    expect(result.log).toContain(
      "Running a release check: the compiler outputs changed since that check",
    );
    expect(result.log).not.toContain("Reusing the completed release check");
  },
  120_000,
);

describe("canonical publication paths", () => {
  afterEach(cleanUp);

  itWithSymlinks(
    "checks and publishes the canonical target of an absolute output link",
    async () => {
      const root = packageWith("code-first");
      const output = join(root, "out");
      mkdirSync(output);
      symlinkSync(output, join(root, "dist"));
      writeTsconfig(root, { declaration: true, declarationDir: "dist/types" });
      const manifest = join(root, "package.json");
      const pkg = z
        .record(z.string(), z.unknown())
        .parse(JSON.parse(readFileSync(manifest, "utf8")));
      pkg.files = ["out"];
      pkg.exports = {
        ".": {
          types: "./out/types/index.d.ts",
          browser: "./out/browser/index.js",
          import: "./out/node/index.mjs",
        },
      };
      writeFileSync(manifest, JSON.stringify(pkg));
      const result = await build(root, "code-first");
      expect(
        result.exitCode,
        result.log + JSON.stringify(result.report?.diagnostics),
      ).toBe(0);
      expect(readlinkSync(join(root, "dist"))).toBe(output);
      expect(readFileSync(join(output, "node", "index.mjs"), "utf8")).toContain(
        "invoiceFamily",
      );
      const retained = await prepack(root);
      expect(retained.exitCode, retained.log).toBe(0);
      expect(retained.phases).toEqual([]);
    },
    120_000,
  );
});

describe("retained links", () => {
  afterEach(cleanUp);

  itWithSymlinks(
    "preserves a retained relative symlink through packing and promotion",
    async () => {
      const root = packageWith("code-first");
      writeTsconfig(root, { declaration: true, declarationDir: "types" });
      mkdirSync(join(root, "assets"));
      writeFileSync(join(root, "assets", "keep.txt"), "asset\n");
      mkdirSync(join(root, "dist"));
      symlinkSync("../assets", join(root, "dist", "assets"));
      const result = await build(root, "code-first");
      expect(result.exitCode, result.log).toBe(0);
      expect(readlinkSync(join(root, "dist", "assets"))).toBe("../assets");
      expect(
        readFileSync(join(root, "dist", "assets", "keep.txt"), "utf8"),
      ).toBe("asset\n");
    },
    120_000,
  );
});
