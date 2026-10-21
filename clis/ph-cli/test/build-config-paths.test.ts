import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { build, cleanUp, packageWith } from "./helpers/declarations.js";
import { importRuntime } from "./helpers/loader-cases.js";
import { plainCompile } from "./helpers/workspace.js";

afterEach(cleanUp);

it.each(["JSONC", "multiple bases", "package config"])(
  "loads inherited paths from a %s without the TypeScript JS API",
  async (variant) => {
    const root = packageWith("code-first");
    mkdirSync(join(root, "config"));
    writeFileSync(
      join(root, "config", "runtime.ts"),
      "export const value = 42;\n",
    );
    writeFileSync(
      join(root, "config", "base.json"),
      '{\n// inherited paths\n"compilerOptions": {"paths": {"#runtime": ["./runtime.ts",],},},\n}\n',
    );
    writeFileSync(
      join(root, "config", "other.json"),
      '{"compilerOptions":{"skipLibCheck":true}}',
    );
    let bases: string | string[] = "./config/base";
    if (variant === "multiple bases")
      bases = ["./config/base.json", "./config/other.json"];
    if (variant === "package config") {
      const directory = join(root, "node_modules", "@probe", "config");
      mkdirSync(directory, { recursive: true });
      writeFileSync(
        join(directory, "package.json"),
        '{"name":"@probe/config","tsconfig":"base.json"}',
      );
      writeFileSync(
        join(directory, "base.json"),
        '{"compilerOptions":{"paths":{"#runtime":["../../../config/runtime.ts"]}}}',
      );
      bases = "@probe/config/base.json";
    }
    writeFileSync(
      join(root, "tsconfig.json"),
      JSON.stringify({
        extends: bases,
        compilerOptions: {
          rootDir: ".",
          module: "nodenext",
          target: "esnext",
          noEmit: true,
          skipLibCheck: true,
        },
        include: ["index.ts", "src/**/*.ts"],
      }),
    );
    const manifest = join(root, "package.json");
    writeFileSync(
      manifest,
      readFileSync(manifest, "utf8").replace(
        '"type":"module"',
        '"type":"module","imports":{"#runtime":"./config/runtime.ts"}',
      ),
    );
    importRuntime(root, "#runtime");
    const main = plainCompile(root);
    expect(main.status, main.output).toBe(0);
    const result = await build(root, "code-first");
    expect(
      result.exitCode,
      result.log + JSON.stringify(result.report?.diagnostics),
    ).toBe(0);
  },
  120_000,
);
