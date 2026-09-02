// Read-only dev server for the bench records viewer. Serves bench/ui/, the
// two jsonl files (re-read per request: the store rewrites them whole), and
// `git log` between two recorded shas. Never writes anything.
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const uiDir = dirname(fileURLToPath(import.meta.url));
const benchDir = process.env.BENCH_DIR
  ? resolve(process.env.BENCH_DIR)
  : resolve(uiDir, "..");
const repoRoot = resolve(uiDir, "../../../..");
const port = Number(process.env.PORT ?? 4310);

const RECORD_FILES = new Set(["BENCHMARKS.jsonl", "TASKS.jsonl"]);
const SHA = /^[0-9a-f]{7,40}$/;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jsonl": "application/x-ndjson; charset=utf-8",
};

function git(args) {
  return new Promise((done, fail) => {
    execFile("git", args, { cwd: repoRoot }, (error, stdout) => {
      if (error) {
        fail(error);
      } else {
        done(stdout);
      }
    });
  });
}

async function describeSha(sha) {
  try {
    return (await git(["log", "-1", "--format=%h %s", sha])).trim();
  } catch {
    return undefined;
  }
}

async function commitsBetween(from, to) {
  const endpoints = {
    from: await describeSha(from),
    to: await describeSha(to),
  };
  const unknown = [
    endpoints.from === undefined ? from : undefined,
    endpoints.to === undefined ? to : undefined,
  ].filter((sha) => sha !== undefined);
  if (unknown.length > 0) {
    return {
      commits: [],
      endpoints,
      warning: `Not in this checkout: ${unknown.join(", ")}`,
    };
  }
  try {
    await git(["merge-base", "--is-ancestor", from, to]);
  } catch {
    return {
      commits: [],
      endpoints,
      warning: `${from} is not an ancestor of ${to}; the runs sit on different lines of history`,
    };
  }
  const out = await git([
    "log",
    "--format=%h%x09%s",
    "--no-decorate",
    `${from}..${to}`,
  ]);
  const commits = out
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => {
      const [sha, ...rest] = line.split("\t");
      return { sha, subject: rest.join("\t") };
    });
  return { commits, endpoints };
}

function send(response, status, body, type) {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function sendJson(response, status, payload) {
  send(response, status, JSON.stringify(payload), TYPES[".json"]);
}

async function sendFile(response, path) {
  try {
    const body = await readFile(path);
    send(
      response,
      200,
      body,
      TYPES[extname(path)] ?? "application/octet-stream",
    );
  } catch (error) {
    if (error.code === "ENOENT") {
      send(response, 404, "not found", "text/plain");
    } else {
      send(response, 500, String(error.message), "text/plain");
    }
  }
}

async function handle(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const path = decodeURIComponent(url.pathname);

  if (path === "/api/log") {
    const from = url.searchParams.get("from") ?? "";
    const to = url.searchParams.get("to") ?? "";
    if (!SHA.test(from) || !SHA.test(to)) {
      sendJson(response, 400, { error: "from and to must be 7-40 hex chars" });
      return;
    }
    try {
      sendJson(response, 200, await commitsBetween(from, to));
    } catch (error) {
      sendJson(response, 200, {
        commits: [],
        warning: `git failed: ${String(error.message)}`,
      });
    }
    return;
  }

  if (path.startsWith("/records/")) {
    const name = path.slice("/records/".length);
    if (!RECORD_FILES.has(name)) {
      send(response, 404, "not found", "text/plain");
      return;
    }
    await sendFile(response, resolve(benchDir, name));
    return;
  }

  const target = resolve(uiDir, `.${path === "/" ? "/index.html" : path}`);
  if (!target.startsWith(uiDir + sep)) {
    send(response, 403, "forbidden", "text/plain");
    return;
  }
  await sendFile(response, target);
}

createServer((request, response) => {
  handle(request, response).catch((error) => {
    send(response, 500, String(error.message), "text/plain");
  });
}).listen(port, () => {
  console.log(`bench records viewer: http://localhost:${port}/`);
  console.log(`records from ${benchDir}`);
});
