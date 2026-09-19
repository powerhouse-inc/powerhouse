/** Custom Mastra dev-server routes that serve a run's files as HTML. */
import { registerApiRoute, type ApiRoute } from "@mastra/core/server";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { RUNS_ROOT, runLayout, type AttemptLayout } from "../lib/paths.js";
import { Arm, RunRecord } from "../lib/schemas.js";
import {
  attemptNav,
  attemptStatusLabel,
  isSafeSegment,
  listAttemptFiles,
  listRuns,
  renderIndex,
  renderMarkdownPage,
  renderNotFoundPage,
  renderPrePage,
  renderRunPage,
  reportNav,
  type AttemptEntry,
} from "./pages.js";

/** The slice of Hono's Context the handlers use; its own types do not resolve here. */
interface RouteContext {
  req: {
    param(): Record<string, string>;
    param(name: string): string | undefined;
  };
  html(body: string, status?: number): Response;
  text(
    body: string,
    status?: number,
    headers?: Record<string, string>,
  ): Response;
}

function readRecord(file: string): RunRecord | null {
  try {
    return RunRecord.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

function attemptsOf(
  runId: string,
  runsRoot: string,
  record: RunRecord | null,
): AttemptEntry[] {
  const run = runLayout(runId, runsRoot);
  return (record?.attempts ?? []).map((a) => ({
    taskId: a.taskId,
    arm: a.arm,
    n: a.n,
    status: attemptStatusLabel(a),
    files: listAttemptFiles(run.attempt(a.taskId, a.arm, a.n)),
  }));
}

function renderAttemptFile(
  layout: AttemptLayout,
  runId: string,
  file: string,
): string {
  const text = readFileSync(path.join(layout.dir, file), "utf8");
  const title = `${layout.taskId}/${layout.arm}/${layout.n}/${file}`;
  const nav = attemptNav(runId, layout.taskId, layout.arm, layout.n, file);
  if (file.endsWith(".json")) {
    let pretty = text;
    try {
      pretty = JSON.stringify(JSON.parse(text), null, 2);
    } catch {
      // Not JSON after all: show it as is.
    }
    return renderPrePage(title, pretty, nav);
  }
  if (file.endsWith(".md") && file !== "transcript.compact.md") {
    return renderMarkdownPage(title, text, nav);
  }
  return renderPrePage(title, text, nav);
}

export function docHarnessRoutes(runsRoot: string = RUNS_ROOT): ApiRoute[] {
  return [
    registerApiRoute("/doc-harness", {
      method: "GET",
      requiresAuth: false,
      handler: (c: RouteContext) => c.html(renderIndex(listRuns(runsRoot))),
    }),

    registerApiRoute("/doc-harness/runs/:runId", {
      method: "GET",
      requiresAuth: false,
      handler: (c: RouteContext) => {
        const runId = c.req.param("runId") ?? "";
        if (!isSafeSegment(runId)) return c.text("bad request", 400);
        const run = runLayout(runId, runsRoot);
        if (!existsSync(run.root)) {
          return c.html(
            renderNotFoundPage(`run ${runId}`, `No run at ${run.root}.`),
            404,
          );
        }
        const record = readRecord(run.runJson);
        return c.html(
          renderRunPage(
            runId,
            record,
            attemptsOf(runId, runsRoot, record),
            existsSync(run.reportMd),
          ),
        );
      },
    }),

    registerApiRoute("/doc-harness/runs/:runId/report", {
      method: "GET",
      requiresAuth: false,
      handler: (c: RouteContext) => {
        const runId = c.req.param("runId") ?? "";
        if (!isSafeSegment(runId)) return c.text("bad request", 400);
        const run = runLayout(runId, runsRoot);
        if (!existsSync(run.reportMd)) {
          return c.html(
            renderNotFoundPage(
              `run ${runId}: no report`,
              `REPORT.md is missing. Run: doc-harness report ${runId}`,
            ),
            404,
          );
        }
        return c.html(
          renderMarkdownPage(
            `doc-harness report: ${runId}`,
            readFileSync(run.reportMd, "utf8"),
            reportNav(runId),
          ),
        );
      },
    }),

    registerApiRoute("/doc-harness/runs/:runId/report.md", {
      method: "GET",
      requiresAuth: false,
      handler: (c: RouteContext) => {
        const runId = c.req.param("runId") ?? "";
        if (!isSafeSegment(runId)) return c.text("bad request", 400);
        const run = runLayout(runId, runsRoot);
        if (!existsSync(run.reportMd)) return c.text("not found", 404);
        return c.text(readFileSync(run.reportMd, "utf8"), 200, {
          "content-type": "text/markdown; charset=utf-8",
        });
      },
    }),

    registerApiRoute(
      "/doc-harness/runs/:runId/attempts/:taskId/:arm/:n/:file",
      {
        method: "GET",
        requiresAuth: false,
        handler: (c: RouteContext) => {
          const p = c.req.param();
          const { runId = "", taskId = "", n = "", file = "" } = p;
          const arm = Arm.safeParse(p.arm);
          const num = Number(n);
          if (
            ![runId, taskId, file].every(isSafeSegment) ||
            !arm.success ||
            !/^[1-9]\d*$/.test(n)
          ) {
            return c.text("bad request", 400);
          }
          const layout = runLayout(runId, runsRoot).attempt(
            taskId,
            arm.data,
            num,
          );
          if (!listAttemptFiles(layout).includes(file)) {
            return c.text("not found", 404);
          }
          return c.html(renderAttemptFile(layout, runId, file));
        },
      },
    ),
  ];
}
