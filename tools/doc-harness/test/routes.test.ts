import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ApiRoute } from "@mastra/core/server";
import { runLayout } from "../src/lib/paths.js";
import { docHarnessRoutes } from "../src/server/routes.js";

const FIXTURES = path.join(import.meta.dirname, "fixtures/report/runs");
const RUN_ID = "2026-09-17T10-00-00Z";

let runsRoot: string;
let outside: string;
let routes: ApiRoute[];

beforeAll(() => {
  const tmp = mkdtempSync(path.join(tmpdir(), "doc-harness-routes-"));
  runsRoot = path.join(tmp, "runs");
  cpSync(FIXTURES, runsRoot, { recursive: true });
  const run = runLayout(RUN_ID, runsRoot);
  writeFileSync(
    run.reportMd,
    "# report\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n<script>x()</script>\n",
  );
  const attempt = run.attempt("custom-read-model", "A", 1);
  mkdirSync(attempt.dir, { recursive: true });
  writeFileSync(attempt.compactMd, "turn 1\n<b>not html</b>\n");
  writeFileSync(attempt.judgeJson, '{"kept":[],"a":1}');
  writeFileSync(path.join(attempt.dir, "settings.json"), "{}");
  // A readable file outside runs/ that no route may ever serve.
  outside = path.join(tmp, "secret.md");
  writeFileSync(outside, "SECRET\n");
  routes = docHarnessRoutes(runsRoot);
});
afterAll(() => {
  rmSync(path.dirname(runsRoot), { recursive: true, force: true });
});

function route(
  p: string,
): (params: Record<string, string>) => Promise<Response> {
  const r = routes.find((x) => x.path === p && x.method === "GET");
  if (!r || !("handler" in r)) throw new Error(`no route ${p}`);
  const handler = r.handler as unknown as (
    c: unknown,
  ) => Response | Promise<Response>;
  return async (params) => {
    const c = {
      req: {
        param: (k?: string) => (k === undefined ? params : params[k]),
      },
      html: (s: string, st = 200) =>
        new Response(s, {
          status: st,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      text: (s: string, st = 200, headers?: Record<string, string>) =>
        new Response(s, {
          status: st,
          headers: { "content-type": "text/plain", ...headers },
        }),
    };
    return handler(c);
  };
}

const INDEX = "/doc-harness";
const RUN = "/doc-harness/runs/:runId";
const REPORT = "/doc-harness/runs/:runId/report";
const REPORT_MD = "/doc-harness/runs/:runId/report.md";
const FILE = "/doc-harness/runs/:runId/attempts/:taskId/:arm/:n/:file";

describe("docHarnessRoutes", () => {
  it("registers five GET routes outside /api with auth off", () => {
    expect(routes.map((r) => r.path).sort()).toEqual(
      [INDEX, RUN, REPORT, REPORT_MD, FILE].sort(),
    );
    for (const r of routes) {
      expect(r.method).toBe("GET");
      expect(r.path.startsWith("/api")).toBe(false);
      expect(r.requiresAuth).toBe(false);
    }
  });

  it("index lists the fixture run", async () => {
    const res = await route(INDEX)({});
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`/doc-harness/runs/${RUN_ID}"`);
    expect(html).toContain(`/doc-harness/runs/${RUN_ID}/report"`);
  });

  it("run page links the report and the attempt files that exist", async () => {
    const res = await route(RUN)({ runId: RUN_ID });
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain(`/doc-harness/runs/${RUN_ID}/report"`);
    expect(html).toContain(
      `/attempts/custom-read-model/A/1/transcript.compact.md`,
    );
    expect(html).toContain(`/attempts/custom-read-model/A/1/judge.json`);
    expect(html).toContain(`/attempts/custom-read-model/A/1/metrics.json`);
    expect(html).not.toContain("settings.json");
  });

  it("run page is 404 for an unknown run", async () => {
    const res = await route(RUN)({ runId: "nope" });
    expect(res.status).toBe(404);
  });

  it("report renders the table and escapes raw HTML", async () => {
    const res = await route(REPORT)({ runId: RUN_ID });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    const html = await res.text();
    expect(html).toContain("<table>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("report.md serves the raw markdown", async () => {
    const res = await route(REPORT_MD)({ runId: RUN_ID });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(await res.text()).toContain("| a | b |");
  });

  it("missing report is a 404 page with the report command", async () => {
    mkdirSync(path.join(runsRoot, "bare"));
    const res = await route(REPORT)({ runId: "bare" });
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("doc-harness report bare");
    expect((await route(REPORT_MD)({ runId: "bare" })).status).toBe(404);
  });

  it("attempt files render by kind", async () => {
    const base = {
      runId: RUN_ID,
      taskId: "custom-read-model",
      arm: "A",
      n: "1",
    };
    const md = await route(FILE)({ ...base, file: "transcript.compact.md" });
    expect(md.status).toBe(200);
    const mdHtml = await md.text();
    expect(mdHtml).toContain("<pre>");
    expect(mdHtml).toContain("&lt;b&gt;not html&lt;/b&gt;");
    expect(mdHtml).not.toContain("<b>not html</b>");

    const json = await route(FILE)({ ...base, file: "judge.json" });
    expect(json.status).toBe(200);
    expect(await json.text()).toContain("&quot;kept&quot;: []");

    expect((await route(FILE)({ ...base, file: "metrics.json" })).status).toBe(
      200,
    );
    expect((await route(FILE)({ ...base, file: "settings.json" })).status).toBe(
      404,
    );
    expect((await route(FILE)({ ...base, file: "nope.json" })).status).toBe(
      404,
    );
    expect((await route(FILE)({ ...base, arm: "C" })).status).toBe(400);
    expect((await route(FILE)({ ...base, n: "0" })).status).toBe(400);
    expect((await route(FILE)({ ...base, n: "1.5" })).status).toBe(400);
    expect((await route(FILE)({ ...base, n: "x" })).status).toBe(400);
  });

  it("rejects traversal in every segment with 400 and serves nothing", async () => {
    const bad = ["..", "..%2F..%2Fetc", "../secret.md", "a/b", "a\\b", ""];
    for (const id of bad) {
      expect((await route(RUN)({ runId: id })).status).toBe(400);
      expect((await route(REPORT)({ runId: id })).status).toBe(400);
      expect((await route(REPORT_MD)({ runId: id })).status).toBe(400);
    }
    const base = {
      runId: RUN_ID,
      taskId: "custom-read-model",
      arm: "A",
      n: "1",
      file: "judge.json",
    };
    for (const id of bad) {
      expect((await route(FILE)({ ...base, taskId: id })).status).toBe(400);
      expect((await route(FILE)({ ...base, file: id })).status).toBe(400);
      expect((await route(FILE)({ ...base, runId: id })).status).toBe(400);
    }
    const res = await route(FILE)({ ...base, file: "../../../../secret.md" });
    expect(res.status).toBe(400);
    expect(await res.text()).not.toContain("SECRET");
  });
});
