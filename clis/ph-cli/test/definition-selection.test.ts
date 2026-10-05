import { parse } from "cmd-ts";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { build } from "../src/commands/build.js";
import {
  modelCheck,
  modelInspect,
  modelPrepack,
} from "../src/commands/model.js";
import { publish } from "../src/commands/publish.js";
import {
  selectedCliSources,
  selectedConfigFile,
  selectedPackageRoot,
} from "../src/services/definitions/selection.js";

const selectionArgv = [
  "--config-file",
  "packages/invoice/powerhouse.config.json",
  "--source",
  "./a.ts",
  "--source",
  "./b.ts#/invoice",
];

async function parsed(
  command: Parameters<typeof parse>[0],
  argv: string[],
): Promise<Record<string, unknown>> {
  const result = await parse(command, argv);
  if (result._tag !== "ok") throw new Error(JSON.stringify(result.error));
  return result.value as Record<string, unknown>;
}

describe("every definition-aware command", () => {
  it.each([
    { name: "ph model check", command: modelCheck, argv: [] },
    { name: "ph model inspect", command: modelInspect, argv: ["test/a@1"] },
    { name: "ph model prepack", command: modelPrepack, argv: [] },
    { name: "ph build", command: build, argv: [] },
    { name: "ph publish", command: publish, argv: [] },
  ])(
    "$name reads --config-file and repeatable --source",
    async ({ command, argv }) => {
      expect(await parsed(command, [...argv, ...selectionArgv])).toMatchObject({
        configFile: "packages/invoice/powerhouse.config.json",
        source: ["./a.ts", "./b.ts#/invoice"],
      });
    },
  );

  it.each([
    { name: "ph model check", command: modelCheck },
    { name: "ph model prepack", command: modelPrepack },
    { name: "ph build", command: build },
    { name: "ph publish", command: publish },
  ])("$name reads --warnings-as-errors", async ({ command }) => {
    expect(await parsed(command, ["--warnings-as-errors"])).toMatchObject({
      warningsAsErrors: true,
    });
  });
});

describe("the selected package root", () => {
  it("is the directory of the selected config file", () => {
    expect(
      selectedPackageRoot({
        configFile: "/packages/invoice/powerhouse.config.json",
        source: [],
      }),
    ).toBe("/packages/invoice");
  });

  it("is the working directory when no config file is selected", () => {
    const none = { configFile: undefined, source: [] };
    expect(selectedPackageRoot(none)).toBe(process.cwd());
    expect(selectedConfigFile(none)).toBe(
      join(process.cwd(), "powerhouse.config.json"),
    );
  });
});

describe("the CLI source list", () => {
  it("stands aside when it is empty, and replaces the config when it is not", () => {
    expect(
      selectedCliSources({ configFile: undefined, source: [] }),
    ).toBeUndefined();
    expect(
      selectedCliSources({
        configFile: undefined,
        source: ["./a.ts", "./b.ts"],
      }),
    ).toEqual(["./a.ts", "./b.ts"]);
  });
});
