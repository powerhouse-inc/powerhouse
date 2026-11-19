import { execFileSync, spawn } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:net";

const pause = (ms) => new Promise((done) => setTimeout(done, ms));
const command = (args) => {
  try {
    return execFileSync(args[0], args.slice(1), {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 10000,
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (error) {
    if (error.status === 1) return error.stdout?.toString() ?? "";
    throw error;
  }
};

// Detached descendants leave the process group but keep the environment they were started with.
function markedPids(marker) {
  const entry = `PH_COVERAGE_OWNER=${marker}`;
  if (process.platform === "linux")
    return readdirSync("/proc")
      .filter((name) => /^\d+$/.test(name))
      .filter((pid) => {
        try {
          return readFileSync(`/proc/${pid}/environ`, "utf8")
            .split("\0")
            .includes(entry);
        } catch {
          return false;
        }
      })
      .map(Number);
  return command(["ps", "-E", "-ax", "-o", "pid=,command="])
    .split("\n")
    .filter((line) => ` ${line} `.includes(` ${entry} `))
    .map((line) => Number(line.trim().split(/\s+/)[0]));
}

function scenarioProcesses(root) {
  const processes = new Map();
  for (const line of command(["ps", "-axo", "pid=,command="]).split("\n")) {
    const match = line.match(/^\s*(\d+)\s+(.*)$/);
    if (match && match[2].includes(root)) processes.set(+match[1], "command");
  }
  let pid;
  for (const line of command(["lsof", "-d", "cwd", "-Fpn"]).split("\n")) {
    if (line.startsWith("p")) pid = Number(line.slice(1));
    if (line === `n${root}` || line.startsWith(`n${root}/`))
      processes.set(pid, "cwd");
  }
  processes.delete(process.pid);
  return [...processes]
    .map(([pid, evidence]) => ({
      pid,
      evidence,
      start: command(["ps", "-p", String(pid), "-o", "lstart="]).trim(),
    }))
    .filter(({ start }) => start);
}

function withStart(pids, evidence) {
  return pids
    .filter((pid) => pid !== process.pid)
    .map((pid) => ({
      pid,
      evidence,
      start: command(["ps", "-p", String(pid), "-o", "lstart="]).trim(),
    }))
    .filter(({ start }) => start);
}

export const stopScenarioProcesses = (root) =>
  stopOwnedProcesses(() => scenarioProcesses(root));

export const stopMarkedProcesses = (marker) =>
  stopOwnedProcesses(() => withStart(markedPids(marker), "environment"));

async function stopOwnedProcesses(find) {
  const stopped = [];
  for (const signal of ["SIGTERM", "SIGKILL"]) {
    for (const item of find()) {
      if (
        command(["ps", "-p", String(item.pid), "-o", "lstart="]).trim() !==
        item.start
      )
        continue;
      try {
        process.kill(item.pid, signal);
        stopped.push({ ...item, signal });
      } catch (error) {
        if (error.code !== "ESRCH") throw error;
      }
    }
    const deadline = Date.now() + (signal === "SIGTERM" ? 5000 : 2000);
    while (find().length && Date.now() < deadline) await pause(200);
  }
  const remaining = find();
  return { valid: remaining.length === 0, stopped, remaining };
}

export async function requireFreePorts(ports) {
  for (const port of ports) {
    const server = createServer();
    await new Promise((done, reject) => {
      server.once("error", () =>
        reject(
          new Error(
            `Required test port ${port} is already occupied; no existing process was stopped`,
          ),
        ),
      );
      server.listen({ port, exclusive: true }, done);
    });
    await new Promise((done, reject) =>
      server.close((error) => (error ? reject(error) : done())),
    );
  }
}

export async function runProcessGroup(argv, { cwd, env, log, signal }) {
  if (signal.aborted)
    return { code: null, signal: signal.reason, notRun: true, command: argv };
  // setpgid keeps the admission session; detached Node children would escape it.
  const child = spawn(
    "python3",
    [
      "-c",
      "import os,sys; os.setpgid(0,0); os.execvp(sys.argv[1],sys.argv[1:])",
      ...argv,
    ],
    {
      cwd,
      env,
      stdio: ["ignore", log, log],
    },
  );
  const alive = () => {
    if (!child.pid) return false;
    try {
      process.kill(-child.pid, 0);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      if (error.code === "EPERM") return true;
      throw error;
    }
  };
  const send = (value) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, value);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  const stop = () => {
    send("SIGTERM");
    child.kill("SIGTERM");
  };
  signal.addEventListener("abort", stop, { once: true });
  let result;
  try {
    result = await new Promise((done, reject) => {
      child.once("error", reject);
      child.once("close", (code, reason) =>
        done({ code, signal: reason, command: argv, processGroup: child.pid }),
      );
    });
  } finally {
    signal.removeEventListener("abort", stop);
    for (const value of ["SIGTERM", "SIGKILL"]) {
      if (!alive()) break;
      send(value);
      const deadline = Date.now() + 3000;
      while (alive() && Date.now() < deadline) await pause(50);
    }
  }
  result.groupCleanup = { valid: !alive() };
  if (!result.groupCleanup.valid) result.code = 1;
  return result;
}
