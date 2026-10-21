import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { createServer } from "node:net";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const scripts = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = [];
after(() =>
  temporary.forEach((path) => rmSync(path, { recursive: true, force: true })),
);

function command(program, args, cwd, env = process.env) {
  return spawnSync(program, args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 20_000,
  });
}

function git(root, ...args) {
  const result = command(
    "git",
    ["-c", "core.hooksPath=/dev/null", ...args],
    root,
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function fixture() {
  const base = mkdtempSync(resolve(tmpdir(), "ph-agent-tools-"));
  temporary.push(base);
  const root = resolve(base, "source");
  const evidence = resolve(base, "evidence");
  mkdirSync(resolve(root, "src"), { recursive: true });
  mkdirSync(evidence);
  writeFileSync(resolve(root, "src/value.txt"), "original\n");
  writeFileSync(resolve(root, ".gitignore"), "dist\n*.local.md\n");
  git(root, "init", "-q");
  git(root, "config", "user.name", "Fixture");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "add", ".");
  git(root, "commit", "-qm", "fixture baseline");
  return { base, root, evidence, context: resolve(evidence, "context.json") };
}

function context(f, mode = "capture", extra = [], root = f.root) {
  return command(
    process.execPath,
    [
      resolve(scripts, "agent-context.mjs"),
      mode,
      "--root",
      root,
      ...(mode === "capture"
        ? ["--input", "src", "--out", f.context, "--evidence-dir", f.evidence]
        : ["--context", f.context]),
      ...extra,
    ],
    f.base,
  );
}

function plan(f, changes = {}) {
  const value = {
    name: "fixture",
    inputs: ["src"],
    preflight: [],
    builds: [],
    outputs: [],
    checks: [
      {
        argv: [process.execPath, "-e", "console.log('consumer passed')"],
        timeoutMs: 2000,
      },
    ],
    ...changes,
  };
  const path = resolve(f.evidence, "plan.json");
  writeFileSync(path, JSON.stringify(value));
  return path;
}

function verify(f, planFile, args = [], env = process.env) {
  const result = command(
    process.execPath,
    [
      resolve(scripts, "verify-task.mjs"),
      "run",
      "--root",
      f.root,
      "--context",
      f.context,
      "--plan",
      planFile,
      "--evidence-dir",
      f.evidence,
      ...args,
    ],
    f.base,
    env,
  );
  const line = result.stdout.trim();
  const output = line ? JSON.parse(line) : null;
  const report = output
    ? JSON.parse(readFileSync(output.report, "utf8"))
    : null;
  return { ...result, output, report };
}

test("dirty edits and declared new files relocate without staging or a project commit", () => {
  const f = fixture();
  writeFileSync(resolve(f.root, "src/value.txt"), "edited\n");
  writeFileSync(resolve(f.root, "src/new.txt"), "new\n");
  assert.equal(context(f, "capture", ["--untracked", "src/new.txt"]).status, 0);
  const target = resolve(f.base, "other");
  git(f.root, "worktree", "add", "--detach", target, "HEAD");
  assert.notEqual(context(f, "check", [], target).status, 0);
  copyFileSync(
    resolve(f.root, "src/value.txt"),
    resolve(target, "src/value.txt"),
  );
  copyFileSync(resolve(f.root, "src/new.txt"), resolve(target, "src/new.txt"));
  assert.equal(context(f, "check", [], target).status, 0);
  assert.equal(
    git(f.root, "rev-parse", "HEAD"),
    git(target, "rev-parse", "HEAD"),
  );
});

test("deleting a whole tracked source directory is a captured change", () => {
  const f = fixture();
  rmSync(resolve(f.root, "src"), { recursive: true });
  const captured = context(f);
  assert.equal(captured.status, 0, captured.stderr);
  assert.equal(context(f, "check").status, 0);
});

test("staged additions can transfer as unstaged files", () => {
  const f = fixture();
  writeFileSync(resolve(f.root, "src/added.txt"), "added\n");
  git(f.root, "add", "src/added.txt");
  assert.equal(context(f).status, 0);
  git(f.root, "reset", "-q", "HEAD");
  assert.equal(context(f, "check").status, 0);
});

test("new undeclared inputs cannot be silently omitted", () => {
  const f = fixture();
  writeFileSync(resolve(f.root, "src/new.txt"), "new\n");
  const result = context(f);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Undeclared new inputs: src\/new.txt/);
});

test("explicit untracked inputs outside captured scopes are rejected", () => {
  const f = fixture();
  writeFileSync(resolve(f.root, "outside.txt"), "transferred input\n");
  const result = context(f, "capture", ["--untracked", "outside.txt"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside captured inputs/);
});

test("explicit staged additions outside captured scopes are rejected", () => {
  const f = fixture();
  writeFileSync(resolve(f.root, "outside.txt"), "declared staged input\n");
  git(f.root, "add", "outside.txt");
  const result = context(f, "capture", ["--untracked", "outside.txt"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /outside captured inputs/);
});

test("new inputs appearing after capture invalidate the context", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  writeFileSync(resolve(f.root, "src/unexpected.txt"), "new\n");
  assert.equal(context(f, "check").status, 2);
});

test("wrong revision and changed bytes are rejected", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  writeFileSync(resolve(f.root, "src/value.txt"), "changed\n");
  assert.match(
    context(f, "check").stderr,
    /Source inputs changed: src\/value.txt/,
  );
  git(f.root, "add", ".");
  git(f.root, "commit", "-qm", "another fixture revision");
  assert.match(context(f, "check").stderr, /Wrong revision/);
});

test("executable bits and symlink identity affect the snapshot", () => {
  const f = fixture();
  symlinkSync("value.txt", resolve(f.root, "src/link"));
  assert.equal(context(f, "capture", ["--untracked", "src/link"]).status, 0);
  chmodSync(resolve(f.root, "src/value.txt"), 0o755);
  assert.equal(context(f, "check").status, 2);
});

test("escaped symlinks and path traversal are refused", () => {
  const f = fixture();
  symlinkSync("../../outside", resolve(f.root, "src/link"));
  assert.match(
    context(f, "capture", ["--untracked", "src/link"]).stderr,
    /escapes the checkout/,
  );
  assert.match(
    context(f, "capture", ["--input", "../outside"]).stderr,
    /repository-relative/,
  );
});

test("source symlinks cannot escape through an intermediate symlink", () => {
  const f = fixture();
  const outside = resolve(f.base, "outside");
  mkdirSync(outside);
  writeFileSync(resolve(outside, "payload"), "external\n");
  symlinkSync(outside, resolve(f.root, "middle"));
  symlinkSync("../middle/payload", resolve(f.root, "src/link"));
  const result = context(f, "capture", ["--untracked", "src/link"]);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /escapes the checkout/);
});

test("ignored personal files do not enter a broad source capture", () => {
  const f = fixture();
  writeFileSync(resolve(f.root, "AGENTS.local.md"), "private preferences\n");
  assert.equal(context(f, "capture", ["--input", "."]).status, 0);
  const captured = JSON.parse(readFileSync(f.context, "utf8"));
  assert.equal(
    captured.entries.some((entry) => entry.path.endsWith(".local.md")),
    false,
  );
});

test("evidence cannot be stored in another registered worktree or through its symlink", () => {
  const f = fixture();
  const other = resolve(f.base, "other");
  git(f.root, "worktree", "add", "--detach", other, "HEAD");
  symlinkSync(other, resolve(f.base, "linked"));
  assert.match(
    context(f, "capture", [
      "--evidence-dir",
      resolve(f.base, "linked/artifacts"),
    ]).stderr,
    /outside all repository worktrees/,
  );
});

test("a snapshot cannot overwrite an earlier capture or accept a tampered digest", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  assert.equal(context(f).status, 2);
  const captured = JSON.parse(readFileSync(f.context, "utf8"));
  captured.entries[0].sha256 = "0".repeat(64);
  writeFileSync(f.context, JSON.stringify(captured));
  assert.match(context(f, "check").stderr, /fingerprint is invalid/);
});

test("missing executables prevent every producer build", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const marker = resolve(f.base, "built");
  const result = verify(
    f,
    plan(f, {
      builds: [
        {
          argv: [
            process.execPath,
            "-e",
            `require('fs').writeFileSync(${JSON.stringify(marker)}, 'built')`,
          ],
          timeoutMs: 1000,
        },
      ],
      checks: [
        { argv: ["nonexistent-ph-verification-command"], timeoutMs: 1000 },
      ],
    }),
  );
  assert.equal(result.status, 2);
  assert.equal(result.report.status, "prerequisite-failed");
  assert.equal(existsSync(marker), false);
});

test("failed service probes stop before builds and preserve their exit status", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      preflight: [
        {
          argv: [
            process.execPath,
            "-e",
            "console.error('database unavailable'); process.exit(19)",
          ],
          timeoutMs: 1000,
        },
      ],
    }),
  );
  assert.equal(result.status, 19);
  assert.equal(result.report.status, "prerequisite-failed");
  assert.equal(result.report.steps.length, 1);
  assert.match(
    readFileSync(result.report.steps[0].stderr, "utf8"),
    /database unavailable/,
  );
});

test("a local service probe can verify a reachable test service", async () => {
  const server = createServer((socket) => socket.end());
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const f = fixture();
  assert.equal(context(f).status, 0);
  const script = `const s=require('net').connect(${server.address().port},'127.0.0.1');s.on('connect',()=>{s.end();process.exit(0)});s.on('error',()=>process.exit(1));`;
  const path = plan(f, {
    preflight: [{ argv: [process.execPath, "-e", script], timeoutMs: 1000 }],
  });
  const live = verify(f, path);
  assert.equal(live.status, 0, live.report?.error ?? live.stderr);
  await new Promise((done) => server.close(done));
  const result = verify(f, path);
  assert.notEqual(result.status, 0);
  assert.equal(result.report.status, "prerequisite-failed");
});

test("producer outputs exist before consumer checks and failed checks retain exit 7", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      builds: [
        {
          argv: [
            process.execPath,
            "-e",
            "require('fs').mkdirSync('dist');require('fs').writeFileSync('dist/out','built')",
          ],
          timeoutMs: 1000,
        },
      ],
      outputs: ["dist/out"],
      checks: [
        {
          argv: [
            process.execPath,
            "-e",
            "if(require('fs').readFileSync('dist/out','utf8')!=='built')process.exit(9);console.log('exact output');process.exit(7)",
          ],
          timeoutMs: 1000,
        },
      ],
    }),
  );
  assert.equal(result.status, 7);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.steps[1].exitCode, 7);
  assert.match(
    readFileSync(result.report.steps[1].stdout, "utf8"),
    /exact output/,
  );
  assert.equal(result.report.outputs[0].path, "dist/out");
});

test("missing outputs block checks after a successful producer", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(f, plan(f, { outputs: ["dist/not-built"] }));
  assert.equal(result.status, 2);
  assert.match(result.report.error, /Missing required output/);
  assert.equal(result.report.status, "missing-output");
  assert.equal(result.report.steps.length, 0);
});

test("producer failure is distinct from a failed prerequisite and blocks consumers", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      builds: [
        { argv: [process.execPath, "-e", "process.exit(13)"], timeoutMs: 1000 },
      ],
    }),
  );
  assert.equal(result.status, 13);
  assert.equal(result.report.status, "build-failed");
  assert.equal(result.report.steps.length, 1);
  assert.equal(result.report.steps[0].phase, "builds");
});

test("a normal exit 124 is recorded as a failed check rather than a deadline", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [process.execPath, "-e", "process.exit(124)"],
          timeoutMs: 1000,
        },
      ],
    }),
  );
  assert.equal(result.status, 124);
  assert.equal(result.report.status, "failed");
  assert.equal(result.report.steps[0].outcome, "exit");
});

test("the invocation deadline also bounds a longer command", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [process.execPath, "-e", "setInterval(()=>{},1000)"],
          timeoutMs: 10_000,
        },
      ],
    }),
    ["--deadline-ms", "200"],
  );
  assert.equal(result.status, 124);
  assert.equal(result.report.status, "timeout");
});

test("the final source scan cannot pass after the invocation deadline", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const marker = resolve(f.base, "consumer-finished");
  const delayed = resolve(f.base, "scan-delayed");
  const bin = resolve(f.base, "bin");
  mkdirSync(bin);
  const wrapper = resolve(bin, "git");
  writeFileSync(
    wrapper,
    `#!${process.execPath}
const fs = require('node:fs');
if (fs.existsSync(${JSON.stringify(marker)}) && !fs.existsSync(${JSON.stringify(delayed)})) {
  fs.writeFileSync(${JSON.stringify(delayed)}, 'delayed');
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000);
}
const result = require('node:child_process').spawnSync('git', process.argv.slice(2), {
  stdio: 'inherit', env: { ...process.env, PATH: ${JSON.stringify(process.env.PATH)} }
});
process.exit(result.status ?? 2);
`,
  );
  chmodSync(wrapper, 0o755);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [
            process.execPath,
            "-e",
            `require('fs').writeFileSync(${JSON.stringify(marker)},'done')`,
          ],
          timeoutMs: 2000,
        },
      ],
    }),
    ["--deadline-ms", "2000"],
    { ...process.env, PATH: `${bin}:${process.env.PATH}` },
  );
  assert.equal(result.report.steps[0]?.exitCode, 0);
  assert.equal(result.status, 124);
  assert.equal(result.report.status, "timeout");
});

for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
  ["SIGHUP", 129],
  ["SIGQUIT", 131],
]) {
  test(`${signal} interrupts verification and terminates its command`, async () => {
    const f = fixture();
    assert.equal(context(f).status, 0);
    const orphan = resolve(f.base, "orphan-wrote");
    const childPid = resolve(f.base, "child.pid");
    const result = verify(
      f,
      plan(f, {
        checks: [
          {
            argv: [
              process.execPath,
              "-e",
              `require('fs').writeFileSync(${JSON.stringify(childPid)},String(process.pid));process.kill(process.ppid,${JSON.stringify(signal)});setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(orphan)},'orphan'),900)`,
            ],
            timeoutMs: 5000,
          },
        ],
      }),
    );
    await new Promise((done) => setTimeout(done, 1000));
    assert.equal(result.status, code);
    assert.equal(result.report.status, "interrupted");
    assert.equal(result.report.steps[0].outcome, "interrupted");
    assert.equal(result.report.steps[0].signal, signal);
    const processInfo = JSON.parse(
      readFileSync(
        resolve(dirname(result.report.steps[0].stdout), "process.json"),
        "utf8",
      ),
    );
    assert.equal(processInfo.pid, Number(readFileSync(childPid, "utf8")));
    assert.equal(processInfo.processGroupId, processInfo.pid);
    assert.equal(existsSync(orphan), false);
  });
}

test("an operator interrupt keeps its status when cleanup crosses the deadline", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [
            process.execPath,
            "-e",
            "process.on('SIGTERM',()=>{});process.kill(process.ppid,'SIGINT');setInterval(()=>{},1000)",
          ],
          timeoutMs: 200,
        },
      ],
    }),
  );
  assert.equal(result.status, 130);
  assert.equal(result.report.status, "interrupted");
});

test("a timeout keeps its status when interruption arrives during cleanup", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [
            process.execPath,
            "-e",
            "process.on('SIGTERM',()=>process.kill(process.ppid,'SIGINT'));setInterval(()=>{},1000)",
          ],
          timeoutMs: 200,
        },
      ],
    }),
  );
  assert.equal(result.status, 124);
  assert.equal(result.report.status, "timeout");
});

test("timeout cleanup terminates descendants even if the immediate child exits zero", async () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const marker = resolve(f.base, "orphan-wrote");
  const descendant = `process.on('SIGTERM',()=>{});setTimeout(()=>require('fs').writeFileSync(${JSON.stringify(marker)},'orphan'),1000);setInterval(()=>{},1000);`;
  const parent = `require('child_process').spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:'ignore'});process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000);`;
  const result = verify(
    f,
    plan(f, {
      checks: [{ argv: [process.execPath, "-e", parent], timeoutMs: 150 }],
    }),
  );
  assert.equal(result.status, 124);
  await new Promise((done) => setTimeout(done, 650));
  assert.equal(existsSync(marker), false);
});

test("a command timeout remains a timeout when termination exits zero", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [
            process.execPath,
            "-e",
            "process.on('SIGTERM',()=>process.exit(0));setInterval(()=>{},1000)",
          ],
          timeoutMs: 150,
        },
      ],
    }),
  );
  assert.equal(result.status, 124);
  assert.equal(result.report.status, "timeout");
  assert.equal(result.report.steps[0].outcome, "timeout");
});

test("source changes during a command invalidate its otherwise successful result", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: [
            process.execPath,
            "-e",
            "require('fs').writeFileSync('src/value.txt','changed')",
          ],
          timeoutMs: 1000,
        },
      ],
    }),
  );
  assert.equal(result.status, 2);
  assert.equal(result.report.status, "invalid-source-or-output");
  assert.match(result.report.error, /Source inputs changed/);
});

test("a context too narrow for its verification profile is rejected", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(f, plan(f, { inputs: ["."] }));
  assert.equal(result.status, 2);
  assert.match(result.report.error, /does not cover profile input/);
});

test("plan input traversal cannot bypass source coverage", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const result = verify(f, plan(f, { inputs: ["src/../other"] }));
  assert.equal(result.status, 2);
  assert.equal(result.report.steps.length, 0);
});

test("plan directories and outputs cannot escape through symlinks", () => {
  const f = fixture();
  const outside = resolve(f.base, "outside");
  mkdirSync(outside);
  writeFileSync(resolve(outside, "artifact"), "external\n");
  symlinkSync(outside, resolve(f.root, "dist"));
  assert.equal(context(f).status, 0);
  for (const changes of [
    { outputs: ["dist/artifact"] },
    {
      checks: [
        { argv: [process.execPath, "-e", ""], cwd: "dist", timeoutMs: 1000 },
      ],
    },
  ]) {
    const result = verify(f, plan(f, changes));
    assert.equal(result.status, 2);
    assert.equal(result.report.steps.length, 0);
    assert.match(result.report.error, /escapes the checkout/);
  }
});

test("relative PATH entries resolve from the command working directory", () => {
  const f = fixture();
  mkdirSync(resolve(f.root, "src/tools"));
  const program = resolve(f.root, "src/tools/consumer");
  writeFileSync(
    program,
    `#!${process.execPath}\nconsole.log('local executable passed');\n`,
  );
  chmodSync(program, 0o755);
  assert.equal(context(f, "capture", ["--untracked", "src/tools"]).status, 0);
  const result = verify(
    f,
    plan(f, {
      checks: [
        {
          argv: ["consumer"],
          cwd: "src",
          env: { PATH: "tools" },
          timeoutMs: 1000,
        },
      ],
    }),
  );
  assert.equal(result.status, 0, result.report.error);
  assert.match(
    readFileSync(result.report.steps[0].stdout, "utf8"),
    /local executable passed/,
  );
});

test("baseline and candidate reports remain distinct and survive consumer deletion", () => {
  const f = fixture();
  assert.equal(context(f).status, 0);
  const path = plan(f);
  const baseline = verify(f, path, ["--label", "baseline"]);
  const candidate = verify(f, path, ["--label", "candidate"]);
  assert.equal(baseline.status, 0);
  assert.equal(candidate.status, 0);
  assert.notEqual(baseline.output.report, candidate.output.report);
  const comparison = command(
    process.execPath,
    [
      resolve(scripts, "verify-task.mjs"),
      "compare",
      "--root",
      f.root,
      "--baseline",
      baseline.output.report,
      "--candidate",
      candidate.output.report,
      "--evidence-dir",
      f.evidence,
    ],
    f.base,
  );
  assert.equal(comparison.status, 0, comparison.stderr);
  const comparisonPath = JSON.parse(comparison.stdout).report;
  rmSync(f.root, { recursive: true });
  assert.match(
    readFileSync(baseline.report.steps[0].stdout, "utf8"),
    /consumer passed/,
  );
  const result = JSON.parse(readFileSync(comparisonPath, "utf8"));
  assert.equal(result.baseline.label, "baseline");
  assert.equal(result.candidate.label, "candidate");
  assert.equal(result.status, "passed");
});
