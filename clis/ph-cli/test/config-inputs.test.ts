import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { z } from "zod";
import {
  configDirOptions,
  readConfig,
} from "../src/services/definitions/config-inputs.js";
import {
  cleanUp,
  compileFixture,
  fixtureRuns,
  writeJson,
} from "./compile-fixture.js";

const itWithFixture = it.skipIf(!fixtureRuns);

afterEach(cleanUp);

itWithFixture.each([
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
    const { root } = compileFixture();
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
      writeJson(join(directory, file), {
        compilerOptions: {
          paths: { "#selected": [file] },
          outDir: "${configDir}/" + file,
          noImplicitAny: file === selected,
        },
      });
    }
    if (directory !== root)
      writeJson(join(directory, "package.json"), manifest);
    const config = join(root, "tsconfig.json");
    writeJson(config, {
      extends: base,
      compilerOptions: { noEmit: true },
      files: ["index.ts"],
    });
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
    expect(configDirOptions(config, "7.0.2")).toEqual({
      outDir: `${root}/${selected}`,
    });
  },
);

itWithFixture("reports an extended config tsc could not resolve either", () => {
  const { root } = compileFixture();
  const config = join(root, "tsconfig.json");
  writeJson(config, { extends: "missing-config/base" });
  expect(() => configDirOptions(config, "7.0.2")).toThrow(
    new Error(
      `The extended TypeScript config "missing-config/base" could not be resolved from ${JSON.stringify(config)}.`,
    ),
  );
});

itWithFixture(
  "reads JSONC with comments, trailing commas and a byte order mark",
  () => {
    const { root } = compileFixture();
    const file = join(root, "tsconfig.json");
    writeFileSync(
      file,
      '﻿{\n// line\n"a": "//kept", /* block */ "b": [1, 2,],\n"c": {"d": "/*kept*/",},\n}\n',
    );
    expect(readConfig(file)).toEqual({
      a: "//kept",
      b: [1, 2],
      c: { d: "/*kept*/" },
    });
  },
);

itWithFixture(
  "substitutes ${configDir} in inherited options for the extending config",
  () => {
    const { root, parent } = compileFixture();
    writeJson(join(parent, "base.json"), {
      compilerOptions: {
        outDir: "${configDir}/dist",
        paths: { "#x": ["${configDir}/src/x.ts"] },
        tsBuildInfoFile: "./plain.tsbuildinfo",
        strict: true,
      },
    });
    const config = join(root, "tsconfig.json");
    writeJson(config, {
      extends: "../base.json",
      compilerOptions: { declarationDir: "${configDir}/types" },
    });
    expect(configDirOptions(config, "7.0.2")).toEqual({
      outDir: `${root}/dist`,
      paths: { "#x": [`${root}/src/x.ts`] },
      declarationDir: `${root}/types`,
    });
  },
);
