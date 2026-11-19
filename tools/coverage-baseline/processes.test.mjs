import assert from "node:assert/strict";
import { test } from "node:test";
import { runProcessGroup } from "./processes.mjs";

const missing = () => Object.assign(new Error("absent"), { code: "ESRCH" });
const denied = () =>
  Object.assign(new Error("permission denied"), { code: "EPERM" });

function child(t, probe, send = () => {}) {
  let group;
  const signals = [];
  const original = process.kill.bind(process);
  t.mock.method(process, "kill", (pid, signal) => {
    if (pid >= 0) return original(pid, signal);
    group ??= pid;
    assert.equal(pid, group);
    if (signal === 0) return probe();
    signals.push(signal);
    return send(signal);
  });
  return {
    signals,
    result: runProcessGroup([process.execPath, "-e", ""], {
      cwd: process.cwd(),
      env: process.env,
      log: "ignore",
      signal: new AbortController().signal,
    }),
  };
}

test("cleanup continues after a transient permission-denied liveness probe", async (t) => {
  let probes = 0;
  const run = child(t, () => {
    throw probes++ === 0 ? denied() : missing();
  });
  const result = await run.result;
  assert.equal(result.code, 0);
  assert.equal(result.groupCleanup.valid, true);
  assert.deepEqual(run.signals, ["SIGTERM"]);
});

test("a permission-denied cleanup signal still fails", async (t) => {
  const error = denied();
  const run = child(
    t,
    () => {
      throw denied();
    },
    () => {
      throw error;
    },
  );
  await assert.rejects(run.result, (actual) => actual === error);
  assert.deepEqual(run.signals, ["SIGTERM"]);
});

test("persistent uncertainty escalates and leaves cleanup invalid", async (t) => {
  let now = 0;
  t.mock.method(Date, "now", () => (now += 4000));
  const run = child(t, () => {
    throw denied();
  });
  const result = await run.result;
  assert.equal(result.code, 1);
  assert.equal(result.groupCleanup.valid, false);
  assert.deepEqual(run.signals, ["SIGTERM", "SIGKILL"]);
});

test("an absent process group needs no cleanup signal", async (t) => {
  const run = child(t, () => {
    throw missing();
  });
  const result = await run.result;
  assert.equal(result.code, 0);
  assert.equal(result.groupCleanup.valid, true);
  assert.deepEqual(run.signals, []);
});

test("unexpected liveness errors still fail", async (t) => {
  const error = Object.assign(new Error("probe failed"), { code: "EIO" });
  const run = child(t, () => {
    throw error;
  });
  await assert.rejects(run.result, (actual) => actual === error);
  assert.deepEqual(run.signals, []);
});
