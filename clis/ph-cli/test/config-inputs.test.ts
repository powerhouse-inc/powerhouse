import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import {
  configChain,
  configPathsBase,
} from "../src/services/definitions/config-inputs.js";
import { cleanUp, packageWith } from "./helpers/declarations.js";

afterEach(cleanUp);

it.each([
  {
    name: "relative extension",
    extends: "./base",
    manifest: {},
    selected: "base.json",
    local: true,
  },
  {
    name: "default tsconfig",
    extends: "config-pkg",
    manifest: { main: "unused.json" },
    selected: "tsconfig.json",
  },
  {
    name: "tsconfig field",
    extends: "config-pkg",
    manifest: { main: "unused.json", tsconfig: "base.json" },
    selected: "base.json",
  },
  {
    name: "root exports",
    extends: "config-pkg",
    manifest: { tsconfig: "unused.json", exports: "./base.json" },
    selected: "base.json",
  },
  {
    name: "types condition",
    extends: "config-pkg/base",
    manifest: {
      exports: { "./base": { types: "./base.json", require: "./unused.json" } },
    },
    selected: "base.json",
  },
  {
    name: "require condition order",
    extends: "config-pkg/base",
    manifest: {
      exports: { "./base": { require: "./unused.json", types: "./base.json" } },
    },
    selected: "unused.json",
  },
  {
    name: "export pattern",
    extends: "config-pkg/configs/base.json",
    manifest: { exports: { "./configs/*.json": "./bases/*.json" } },
    selected: "bases/base.json",
  },
  {
    name: "export array",
    extends: "config-pkg/base",
    manifest: { exports: { "./base": ["./base.json", "./unused.json"] } },
    selected: "base.json",
  },
  {
    name: "versioned types",
    extends: "config-pkg/base",
    manifest: {
      exports: {
        "./base": { "types@>=5.6": "./base.json", default: "./unused.json" },
      },
    },
    selected: "base.json",
  },
  {
    name: "typesVersions",
    extends: "config-pkg",
    manifest: {
      tsconfig: "unused.json",
      typesVersions: { ">=5.6": { "unused.json": ["base.json"] } },
    },
    selected: "base.json",
  },
])(
  "matches real tsc config resolution for $name",
  ({ extends: base, manifest, selected, ...layout }) => {
    const root = packageWith("schema-first");
    const directory =
      "local" in layout ? root : join(root, "node_modules/config-pkg");
    mkdirSync(join(directory, "bases"), { recursive: true });
    for (const file of [
      "base.json",
      "unused.json",
      "tsconfig.json",
      "bases/base.json",
    ]) {
      if (directory === root && file === "tsconfig.json") continue;
      writeFileSync(
        join(directory, file),
        JSON.stringify({
          compilerOptions: {
            paths: { "#selected": [file] },
            noImplicitAny: file === selected,
          },
        }),
      );
    }
    const pkg = join(directory, "package.json");
    if (directory !== root) writeFileSync(pkg, JSON.stringify(manifest));
    const config = join(root, "tsconfig.json");
    writeFileSync(
      config,
      JSON.stringify({
        extends: base,
        compilerOptions: { noEmit: true },
        files: ["index.ts"],
      }),
    );
    const shown = spawnSync(
      process.execPath,
      [
        join(root, "node_modules/typescript/bin/tsc"),
        "-p",
        config,
        "--showConfig",
      ],
      { cwd: root, encoding: "utf8" },
    );
    expect(shown.status, shown.stdout + shown.stderr).toBe(0);
    const parsed = z
      .object({
        compilerOptions: z.object({
          noImplicitAny: z.boolean(),
          paths: z.record(z.string(), z.array(z.string())),
        }),
      })
      .parse(JSON.parse(shown.stdout));
    expect(parsed.compilerOptions.noImplicitAny).toBe(true);
    expect(parsed.compilerOptions.paths["#selected"]).toEqual([selected]);
    expect(configPathsBase(config, "7.0.2")).toBe(
      join(directory, selected.includes("/") ? "bases" : "."),
    );
    expect(
      configChain(config, "7.0.2")
        .map((path) => relative(root, path))
        .sort(),
    ).toEqual(
      [
        "tsconfig.json",
        relative(root, join(directory, selected)),
        ...(directory === root ? [] : [relative(root, pkg)]),
      ].sort(),
    );
  },
);
