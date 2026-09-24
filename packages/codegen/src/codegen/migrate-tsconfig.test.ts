import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";
import {
  migrateCompilerOptions,
  migrateTsconfigFiles,
} from "./migrate-tsconfig.js";

// Appends the glob star, so path patterns read as `glob("lib/")`.
const glob = (prefix: string): string => `${prefix}*`;

describe("migrateCompilerOptions", () => {
  it("turns baseUrl into explicit paths", () => {
    const options: Record<string, unknown> = {
      baseUrl: "src",
      paths: {
        [glob("@lib/")]: [glob("lib/")],
        [glob("~/")]: [glob("./app/")],
      },
    };
    expect(migrateCompilerOptions(options)).toBe(true);
    expect(options).toEqual({
      paths: {
        [glob("@lib/")]: [glob("./src/lib/")],
        [glob("~/")]: [glob("./src/app/")],
        [glob("")]: [glob("./src/")],
      },
    });
  });

  it("maps baseUrl '.' without paths to a catch-all", () => {
    const options: Record<string, unknown> = { baseUrl: "." };
    migrateCompilerOptions(options);
    expect(options).toEqual({ paths: { [glob("")]: [glob("./")] } });
  });

  it("drops removed options and false-only flags", () => {
    const options: Record<string, unknown> = {
      downlevelIteration: true,
      outFile: "out.js",
      importsNotUsedAsValues: "error",
      esModuleInterop: false,
      allowSyntheticDefaultImports: true,
      strict: true,
    };
    migrateCompilerOptions(options);
    expect(options).toEqual({
      allowSyntheticDefaultImports: true,
      strict: true,
    });
  });

  it("replaces removed module, target and moduleResolution values", () => {
    const bundled: Record<string, unknown> = {
      module: "umd",
      target: "ES5",
      moduleResolution: "node",
    };
    migrateCompilerOptions(bundled);
    expect(bundled).toEqual({
      module: "esnext",
      target: "es2015",
      moduleResolution: "bundler",
    });

    const node: Record<string, unknown> = {
      module: "NodeNext",
      moduleResolution: "node10",
    };
    migrateCompilerOptions(node);
    expect(node).toEqual({ module: "NodeNext" });
  });

  it("leaves a TypeScript 7 config untouched", () => {
    const options = {
      module: "nodenext",
      target: "esnext",
      strict: true,
      paths: { [glob("editors/")]: [glob("./editors/") + "/index.ts"] },
    };
    const before = structuredClone(options);
    expect(migrateCompilerOptions(options)).toBe(false);
    expect(options).toEqual(before);
  });
});

describe("migrateTsconfigFiles", () => {
  let dir: string | undefined;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("rewrites only the root tsconfig files that need it", () => {
    dir = mkdtempSync(join(tmpdir(), "migrate-tsconfig-"));
    const clean = `{\n  // kept\n  "compilerOptions": { "strict": true }\n}\n`;
    writeFileSync(join(dir, "tsconfig.json"), clean);
    writeFileSync(
      join(dir, "tsconfig.node.json"),
      `{\n  // lost on rewrite\n  "compilerOptions": { "baseUrl": ".", "downlevelIteration": true },\n  "include": ["vite.config.ts"]\n}\n`,
    );
    writeFileSync(join(dir, "other.json"), `{ "baseUrl": "." }`);

    expect(migrateTsconfigFiles(dir)).toEqual(["tsconfig.node.json"]);
    expect(readFileSync(join(dir, "tsconfig.json"), "utf8")).toBe(clean);
    expect(
      JSON.parse(readFileSync(join(dir, "tsconfig.node.json"), "utf8")),
    ).toEqual({
      compilerOptions: { paths: { [glob("")]: [glob("./")] } },
      include: ["vite.config.ts"],
    });
    expect(readFileSync(join(dir, "other.json"), "utf8")).toBe(
      `{ "baseUrl": "." }`,
    );
  });
});
