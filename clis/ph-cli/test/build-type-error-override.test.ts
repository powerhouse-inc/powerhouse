import { appendFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { runPrepack, runPublishCheck } from "../src/services/build.js";
import {
  build,
  cleanUp,
  packageWith,
  prepack,
  writeTsconfig,
} from "./helpers/declarations.js";

const prompt = vi.hoisted(() => vi.fn());
vi.mock("enquirer", () => ({ default: { prompt } }));

afterEach(() => {
  cleanUp();
  vi.unstubAllEnvs();
  prompt.mockReset();
});

function packageWithTypeError(): string {
  const root = packageWith("code-first");
  writeTsconfig(root, { declaration: true, declarationDir: "types" });
  appendFileSync(
    join(root, "index.ts"),
    'export const bad: number = "not a number";\n',
  );
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return root;
}

async function inTerminal<T>(run: () => Promise<T>): Promise<T> {
  const isTTY = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    value: true,
    configurable: true,
  });
  vi.stubEnv("CI", "");
  try {
    return await run();
  } finally {
    if (isTTY === undefined)
      delete (process.stdin as { isTTY?: boolean }).isTTY;
    else Object.defineProperty(process.stdin, "isTTY", isTTY);
  }
}

it("reruns the release check in prepack after a build that accepted type errors", async () => {
  const root = packageWithTypeError();
  const built = await build(root, "code-first", "dist", undefined, true);
  expect(built.exitCode, built.log).toBe(0);
  const output = readFileSync(join(root, "dist", "node", "index.mjs"));
  const packed = await prepack(root);
  expect(packed.exitCode, packed.log).toBe(2);
  expect(packed.log).toContain(
    "▶ Running a release check: no completed release check was retained.\n",
  );
  expect(readFileSync(join(root, "dist", "node", "index.mjs"))).toEqual(output);
}, 240_000);

it("builds again in prepack when it accepts type errors itself", async () => {
  const root = packageWithTypeError();
  const built = await build(root, "code-first", "dist", undefined, true);
  expect(built.exitCode, built.log).toBe(0);
  const packed = await prepack(root, true);
  expect(packed.exitCode, packed.log).toBe(0);
  expect(packed.log).toContain(
    "▶ Running a release check: no completed release check was retained.\n",
  );
}, 240_000);

it("asks about type errors once when ph publish runs the check and then the prepack hook", async () => {
  const root = packageWithTypeError();
  prompt.mockResolvedValue({ confirmed: true });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  const logged: string[] = [];
  const log = (text: string) => logged.push(text);
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const check = await inTerminal(() =>
      runPublishCheck(
        {
          registry: undefined,
          configFile: join(root, "powerhouse.config.json"),
          source: [],
          outDir: "dist",
          warningsAsErrors: false,
          debug: false,
          forwardedArgs: [],
        },
        { log },
      ),
    );
    expect(check.exitCode, logged.join("")).toBe(0);
    expect(prompt).toHaveBeenCalledTimes(1);
    for (const [name, value] of Object.entries(check.prepackEnvironment))
      vi.stubEnv(name, value);
    const packed = await inTerminal(() =>
      runPrepack(
        {
          configFile: undefined,
          outDir: "dist",
          source: [],
          warningsAsErrors: false,
          noSharedDeps: false,
          ignoreTypeErrors: false,
          debug: false,
        },
        { log },
      ),
    );
    expect(packed.exitCode, logged.join("")).toBe(0);
  } finally {
    process.chdir(cwd);
  }
  expect(prompt).toHaveBeenCalledTimes(1);
  expect(logged.filter((line) => line.includes("release check"))).toEqual([
    "▶ Running a release check: no completed release check was retained.\n",
    "▶ Running a release check: no completed release check was retained.\n",
  ]);
}, 360_000);

it("ships nothing from ph publish when the user declines the type errors", async () => {
  const root = packageWithTypeError();
  prompt.mockResolvedValue({ confirmed: false });
  const cwd = process.cwd();
  process.chdir(root);
  try {
    const check = await inTerminal(() =>
      runPublishCheck(
        {
          registry: undefined,
          configFile: join(root, "powerhouse.config.json"),
          source: [],
          outDir: "dist",
          warningsAsErrors: false,
          debug: false,
          forwardedArgs: [],
        },
        { log: () => undefined },
      ),
    );
    expect(check.exitCode).toBe(2);
    expect(prompt).toHaveBeenCalledTimes(1);
  } finally {
    process.chdir(cwd);
  }
}, 240_000);
