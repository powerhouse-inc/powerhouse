import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildInfoFile,
  declarationDirectory,
} from "../src/services/compiler-output/emit.js";
import {
  compilerOutputInventory,
  parseShownConfig,
} from "../src/services/package-build/staging/inventory.js";

const root = resolve("/", "work", "my package");
const at = {
  configFile: join(root, "tsconfig.json"),
  packageRoot: root,
  buildDirectory: join(root, ".ph", "build"),
};

describe("parseShownConfig", () => {
  it("reads the options tsc --showConfig prints", () => {
    expect(
      parseShownConfig(
        JSON.stringify({
          compilerOptions: {
            composite: true,
            declarationMap: true,
            module: "nodenext",
            outFile: "./out/bundle.js",
            sourceMap: true,
            tsBuildInfoFile: "./cache/tsc.tsbuildinfo",
          },
          files: ["./index.ts"],
          exclude: ["dist"],
          references: [{ path: "./child" }],
        }),
      ),
    ).toEqual({
      options: {
        composite: true,
        declarationMap: true,
        outFile: "./out/bundle.js",
        sourceMap: true,
        tsBuildInfoFile: "./cache/tsc.tsbuildinfo",
      },
      exclude: ["dist"],
      references: ["./child"],
    });
  });

  it("reads output that is not JSON as no options", () => {
    expect(parseShownConfig("error TS5083: Cannot read file")).toBe(undefined);
    expect(parseShownConfig('{"files": []}')).toEqual({
      options: {},
      exclude: undefined,
      references: [],
    });
  });
});

describe("declarationDirectory", () => {
  it("is the declaration directory, else the output directory, when tsc writes declarations", () => {
    expect(
      declarationDirectory(
        { declaration: true, declarationDir: "./dist/types", outDir: "lib" },
        root,
      ),
    ).toBe(join(root, "dist", "types"));
    expect(declarationDirectory({ composite: true, outDir: "lib" }, root)).toBe(
      join(root, "lib"),
    );
    expect(declarationDirectory({ declarationDir: "./dist/types" }, root)).toBe(
      undefined,
    );
  });
});

describe("compilerOutputInventory", () => {
  it("keeps an explicit build info file and both directories", () => {
    expect(
      compilerOutputInventory(
        {
          declaration: true,
          declarationDir: "types",
          outDir: "lib",
          tsBuildInfoFile: ".cache/tsc.tsbuildinfo",
        },
        at,
      ),
    ).toEqual([
      { path: join(root, ".cache", "tsc.tsbuildinfo"), kind: "build-info" },
      { path: join(root, "types"), kind: "directory" },
      { path: join(root, "lib"), kind: "directory" },
    ]);
  });

  it("protects nothing outside the package", () => {
    expect(
      compilerOutputInventory(
        {
          declaration: true,
          declarationDir: "../shared-types",
          tsBuildInfoFile: "../cache/tsc.tsbuildinfo",
        },
        at,
      ),
    ).toEqual([]);
  });

  it("protects a directory that is the build output or holds it, and never the package root", () => {
    expect(
      compilerOutputInventory({ declaration: true, outDir: "dist" }, at),
    ).toEqual([
      { path: join(root, "dist", "tsconfig.tsbuildinfo"), kind: "build-info" },
      { path: join(root, "dist"), kind: "directory" },
    ]);
    expect(
      compilerOutputInventory({ declaration: true, declarationDir: "." }, at),
    ).toEqual([
      { path: join(root, "tsconfig.tsbuildinfo"), kind: "build-info" },
    ]);
  });

  it("lists the files outFile writes inside the package, after the build info", () => {
    expect(
      compilerOutputInventory(
        {
          outFile: "out/bundle.js",
          declaration: true,
          sourceMap: true,
          declarationMap: true,
        },
        at,
      ),
    ).toEqual([
      { path: join(root, "out", "bundle.tsbuildinfo"), kind: "build-info" },
      { path: join(root, "out", "bundle.js"), kind: "file" },
      { path: join(root, "out", "bundle.js.map"), kind: "file" },
      { path: join(root, "out", "bundle.d.ts"), kind: "file" },
      { path: join(root, "out", "bundle.d.ts.map"), kind: "file" },
    ]);
    expect(
      compilerOutputInventory(
        {
          outFile: "out/bundle.js",
          declaration: true,
          emitDeclarationOnly: true,
        },
        at,
      ),
    ).toEqual([
      { path: join(root, "out", "bundle.tsbuildinfo"), kind: "build-info" },
      { path: join(root, "out", "bundle.d.ts"), kind: "file" },
    ]);
    expect(
      compilerOutputInventory({ outFile: "../bundle.js", noEmit: true }, at),
    ).toEqual([]);
  });

  it("leaves out a directory holding the build's own runs, and keeps its build info", () => {
    expect(
      compilerOutputInventory({ declaration: true, outDir: ".ph" }, at),
    ).toEqual([
      { path: join(root, ".ph", "tsconfig.tsbuildinfo"), kind: "build-info" },
    ]);
    expect(
      compilerOutputInventory(
        { declaration: true, outDir: ".ph/build", declarationDir: ".ph/types" },
        at,
      ),
    ).toEqual([
      {
        path: join(root, ".ph", "build", "tsconfig.tsbuildinfo"),
        kind: "build-info",
      },
      { path: join(root, ".ph", "types"), kind: "directory" },
    ]);
  });
});

describe("buildInfoFile", () => {
  const config = join(root, "tsconfig.json");

  it("is in the output directory at the config's place relative to rootDir", () => {
    expect(buildInfoFile({ outDir: "lib", rootDir: "src" }, config)).toBe(
      join(root, "tsconfig.tsbuildinfo"),
    );
    expect(buildInfoFile({ outDir: "lib/out", rootDir: "." }, config)).toBe(
      join(root, "lib", "out", "tsconfig.tsbuildinfo"),
    );
    expect(
      buildInfoFile(
        { outDir: "lib", rootDir: "src/code" },
        join(root, "tsconfig.build.json"),
      ),
    ).toBe(join(root, "lib", "..", "..", "tsconfig.build.tsbuildinfo"));
  });

  it("is in the output directory without rootDir, beside outFile, or as tsBuildInfoFile says", () => {
    expect(buildInfoFile({ outDir: "lib" }, config)).toBe(
      join(root, "lib", "tsconfig.tsbuildinfo"),
    );
    expect(buildInfoFile({ outFile: "out/bundle.js" }, config)).toBe(
      join(root, "out", "bundle.tsbuildinfo"),
    );
    expect(
      buildInfoFile(
        {
          outDir: "lib",
          rootDir: "src",
          tsBuildInfoFile: ".cache/a.tsbuildinfo",
        },
        config,
      ),
    ).toBe(join(root, ".cache", "a.tsbuildinfo"));
    expect(buildInfoFile({}, config)).toBe(join(root, "tsconfig.tsbuildinfo"));
  });
});
