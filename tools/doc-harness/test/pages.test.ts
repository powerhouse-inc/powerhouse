import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runLayout } from "../src/lib/paths.js";
import {
  attemptStatusLabel,
  escapeHtml,
  isSafeSegment,
  listAttemptFiles,
  listRuns,
  renderIndex,
  renderMarkdown,
  renderPrePage,
  renderRunPage,
} from "../src/server/pages.js";

describe("isSafeSegment", () => {
  it.each(["pilot-1", "2026-09-17T15-18-54Z", "metrics.json", "A", "1"])(
    "accepts %s",
    (s) => {
      expect(isSafeSegment(s)).toBe(true);
    },
  );

  it.each(["..", "a/b", "a\\b", "", "%2F", "..%2F..%2Fetc", ".", "a b", "a?"])(
    "rejects %j",
    (s) => {
      expect(isSafeSegment(s)).toBe(false);
    },
  );
});

describe("escapeHtml", () => {
  it("escapes the five characters", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;",
    );
  });
});

describe("renderMarkdown", () => {
  it("renders a GFM table", () => {
    const html = renderMarkdown(
      "| task | arm |\n| --- | --- |\n| custom-read-model | A |\n",
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<td>custom-read-model</td>");
  });

  it("escapes raw HTML blocks and inline tags instead of emitting them", () => {
    const html = renderMarkdown(
      "<script>alert(1)</script>\n\ntext <img src=x onerror=alert(1)> more\n",
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("drops javascript: links but keeps http and relative ones", () => {
    const html = renderMarkdown(
      "[a](javascript:alert(1)) [b](https://x.test/y) [c](./z.md)\n",
    );
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://x.test/y"');
    expect(html).toContain('href="./z.md"');
  });

  it("keeps fenced code escaped", () => {
    const html = renderMarkdown("```ts\nconst a = 1 < 2;\n```\n");
    expect(html).toContain("<pre>");
    expect(html).toContain("1 &lt; 2");
  });
});

describe("renderPrePage", () => {
  it("escapes the text and the title", () => {
    const html = renderPrePage("<t>", "a <b> c");
    expect(html).toContain("<title>&lt;t&gt;</title>");
    expect(html).toContain("<pre>a &lt;b&gt; c</pre>");
    expect(html).not.toContain("<b>");
  });
});

describe("listRuns and the index", () => {
  const FIXTURE_RUNS = path.join(
    import.meta.dirname,
    "fixtures/report/runs/2026-09-17T10-00-00Z/run.json",
  );
  let runsRoot: string;

  beforeAll(() => {
    runsRoot = mkdtempSync(path.join(tmpdir(), "doc-harness-pages-"));
    const good = path.join(runsRoot, "2026-09-17T10-00-00Z");
    mkdirSync(good);
    writeFileSync(path.join(good, "run.json"), readFixture());
    writeFileSync(path.join(good, "REPORT.md"), "# r\n");
    const older = path.join(runsRoot, "2026-09-16T10-00-00Z");
    mkdirSync(older);
    writeFileSync(
      path.join(older, "run.json"),
      readFixture()
        .replace("2026-09-17T10-00-00Z", "2026-09-16T10-00-00Z")
        .replace("2026-09-17T11:30:00Z", "2026-09-16T11:30:00Z"),
    );
    const bad = path.join(runsRoot, "broken");
    mkdirSync(bad);
    writeFileSync(path.join(bad, "run.json"), "{ not json");
    mkdirSync(path.join(runsRoot, "no-run-json"));
  });
  afterAll(() => {
    rmSync(runsRoot, { recursive: true, force: true });
  });

  function readFixture(): string {
    return readFileSync(FIXTURE_RUNS, "utf8");
  }

  it("lists parseable runs newest first and flags the report", () => {
    const runs = listRuns(runsRoot);
    expect(runs.map((r) => r.runId)).toEqual([
      "2026-09-17T10-00-00Z",
      "2026-09-16T10-00-00Z",
    ]);
    expect(runs[0]).toMatchObject({
      finishedAt: "2026-09-17T11:30:00Z",
      reportExists: true,
    });
    expect(runs[0].attempts).toBeGreaterThan(0);
    expect(runs[1].reportExists).toBe(false);
  });

  it("returns [] for a missing root", () => {
    expect(listRuns(path.join(runsRoot, "nope"))).toEqual([]);
  });

  it("renders links to each run", () => {
    const html = renderIndex(listRuns(runsRoot));
    expect(html).toContain('href="/doc-harness/runs/2026-09-17T10-00-00Z"');
    expect(html).toContain(
      'href="/doc-harness/runs/2026-09-17T10-00-00Z/report"',
    );
    expect(html).toContain("<table>");
    expect(html).toContain("<th>rate-limited</th>");
    expect(listRuns(runsRoot)[0].rateLimited).toBe(0);
  });

  it("attemptStatusLabel marks truncation and judge failures", () => {
    expect(
      attemptStatusLabel({
        status: "complete",
        truncated: false,
        judgeFailed: null,
      }),
    ).toBe("complete");
    expect(
      attemptStatusLabel({
        status: "complete",
        truncated: true,
        judgeFailed: "budget-exhausted",
      }),
    ).toBe("complete (truncated; judge budget-exhausted)");
    expect(
      attemptStatusLabel({
        status: "rate-limited",
        truncated: false,
        judgeFailed: null,
      }),
    ).toBe("rate-limited");
  });

  it("listAttemptFiles returns only the known files that exist", () => {
    const layout = runLayout("2026-09-17T10-00-00Z", runsRoot).attempt(
      "custom-read-model",
      "A",
      1,
    );
    mkdirSync(layout.dir, { recursive: true });
    writeFileSync(layout.compactMd, "# t\n");
    writeFileSync(layout.metricsJson, "{}");
    writeFileSync(path.join(layout.dir, "session.jsonl"), "");
    expect(listAttemptFiles(layout)).toEqual([
      "transcript.compact.md",
      "metrics.json",
    ]);
    expect(
      listAttemptFiles(runLayout("x", runsRoot).attempt("t", "A", 1)),
    ).toEqual([]);
  });

  it("renderRunPage links the present files and escapes ids", () => {
    const html = renderRunPage(
      "r<1",
      null,
      [
        {
          taskId: "t",
          arm: "A",
          n: 1,
          status: "complete",
          files: ["metrics.json"],
        },
      ],
      false,
    );
    expect(html).toContain("r&lt;1");
    expect(html).not.toContain("<h1>r<1");
    expect(html).toContain("/attempts/t/A/1/metrics.json");
    expect(html).toContain("doc-harness report");
  });
});
