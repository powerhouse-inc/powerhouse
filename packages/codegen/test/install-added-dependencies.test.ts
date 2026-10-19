import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, expect, it } from "vitest";
import { useFakePackageManager } from "./fake-package-manager.js";

const disposals: (() => void)[] = [];
afterEach(() => {
  for (const dispose of disposals.splice(0).reverse()) dispose();
});
function fixture(recordCwd = false) {
  const root = mkdtempSync(join(tmpdir(), "install-chain-"));
  disposals.push(() => rmSync(root, { recursive: true, force: true }));
  writeFileSync(
    join(root, "package.json"),
    '{"name":"probe","packageManager":"npm@11.0.0"}',
  );
  const fake = useFakePackageManager({}, { recordStdin: true, recordCwd });
  disposals.push(fake.restore);
  const helper = pathToFileURL(
    join(
      import.meta.dirname,
      "../../shared/clis/file-system/install-added-dependencies.ts",
    ),
  ).href;
  const run = (body: string, extraEnv: Record<string, string> = {}) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { installAddedDependencies as install } from ${JSON.stringify(helper)};\n${body}`,
      ],
      {
        encoding: "utf8",
        input: "user-answer\n",
        timeout: 15_000,
        env: { ...process.env, ...extraEnv },
      },
    );
  return { root, fake, run };
}
it.each([undefined, true, false])(
  "forwards stdin only in interactive mode (%s)",
  (interactive) => {
    const { root, fake, run } = fixture();
    const options = interactive === undefined ? {} : { interactive };
    const result = run(
      `await install(["fake-only"], ${JSON.stringify(root)}, ${JSON.stringify(options)});`,
    );
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(fake.calls()).toEqual([
      {
        command: "npm",
        args: ["i"],
        reactorApiBefore: false,
        stdin: interactive === false ? "" : "user-answer\n",
      },
    ]);
  },
);
it("serializes two installs in the same project", () => {
  const { root, run } = fixture();
  const events = join(root, "events.jsonl");
  const result = run(
    `await Promise.all([install(["one"], ${JSON.stringify(root)}, {interactive:false}), install(["two"], ${JSON.stringify(root)}, {interactive:false})]);`,
    { PH_FAKE_INSTALL_EVENTS: events },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(readFileSync(events, "utf8").trim().split("\n")).toEqual([
    "start",
    "end",
    "start",
    "end",
  ]);
});

it("warns after a failed install and completes the next queued install", () => {
  const { root, fake, run } = fixture(true);
  const completed = join(root, "completed");
  const result = run(
    `await Promise.all([install(["one"], ${JSON.stringify(root)}, {interactive:false}), install(["two"], ${JSON.stringify(root)}, {interactive:false})]);`,
    {
      PH_FAKE_INSTALL_FAIL_ONCE: join(root, "failed"),
      PH_FAKE_INSTALL_SUCCESS: completed,
    },
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stderr.trim()).toBe(
    `Install failed. Run \`npm i\` in ${root} to install them.`,
  );
  expect(fake.calls()).toStrictEqual(
    [1, 2].map(() => ({
      command: "npm",
      args: ["i"],
      cwd: realpathSync(root),
      stdin: "",
      reactorApiBefore: false,
    })),
  );
  expect(readFileSync(completed, "utf8")).toBe("complete\n");
});

it("does not spawn for skip-install or an empty added list", () => {
  const { root, fake, run } = fixture();
  const result = run(
    `await install(["one"], ${JSON.stringify(root)}, { skipInstall: true }); await install([], ${JSON.stringify(root)});`,
  );
  expect(result.status, result.stdout + result.stderr).toBe(0);
  expect(result.stdout.trim()).toBe("Run `npm i` to install them.");
  expect(result.stderr).toBe("");
  expect(fake.calls()).toStrictEqual([]);
});
