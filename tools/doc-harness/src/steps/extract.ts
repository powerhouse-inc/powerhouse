/** Deterministic metrics and the compact transcript, from the builder's JSONL. */
import { createStep } from "@mastra/core/workflows";
import { existsSync, readFileSync } from "node:fs";
import { compactTranscript } from "../lib/compact.js";
import { deniedRoots } from "../lib/context.js";
import { buildDocsSymbolIndex } from "../lib/docs.js";
import { AcceptanceOutput, ExtractOutput, Metrics } from "../lib/schemas.js";
import { extractMetrics, parseTranscriptLines } from "../lib/transcript.js";
import { build } from "./build.js";
import {
  attemptLabel,
  attemptScope,
  type TaskRunInput,
  readCached,
  writeJson,
  writeText,
} from "./shared.js";

function loadRecords(paths: (string | null)[]): unknown[] {
  for (const file of paths) {
    if (file === null || !existsSync(file)) continue;
    const { records } = parseTranscriptLines(readFileSync(file, "utf8"));
    if (records.length > 0) return records;
  }
  return [];
}

export const extract = createStep({
  id: "extract",
  inputSchema: AcceptanceOutput,
  outputSchema: ExtractOutput,
  retries: 0,
  execute: (params) => {
    const { input, ctx, layout } = attemptScope(
      params.getInitData<TaskRunInput>(),
    );
    const built = params.getStepResult(build);
    const base = {
      metricsPath: layout.metricsJson,
      compactPath: layout.compactMd,
    };

    const cached = readCached(layout.metricsJson, Metrics);
    if (cached) {
      return Promise.resolve({
        ...base,
        skipped: false,
        docPagesRead: cached.docPagesRead.length,
        escapes: cached.escapes.length,
        bashErrors: cached.bashCommands.filter((b) => b.isError).length,
        contaminated: cached.contaminated,
      });
    }

    const records = built.skipped
      ? []
      : loadRecords([built.transcriptPath, built.sessionJsonlPath]);
    if (records.length === 0) {
      return Promise.resolve({
        ...base,
        skipped: true,
        docPagesRead: 0,
        escapes: 0,
        bashErrors: 0,
        contaminated: false,
      });
    }

    const docs = buildDocsSymbolIndex(input.docsDir);
    const metrics = Metrics.parse(
      extractMetrics(records, {
        workspaceDir: layout.workspaceDir,
        docsDir: input.docsDir,
        deniedRoots: deniedRoots(ctx),
        docsHasSymbol: (s) => docs.hasSymbol(s),
        docsIndex: (s) => {
          const rel = docs.pagesWith(s).at(0);
          return rel === undefined ? null : { rel };
        },
      }),
    );
    writeJson(layout.metricsJson, metrics);
    writeText(layout.compactMd, compactTranscript(records));
    ctx.log(
      `${attemptLabel(input)} extract pages=${metrics.docPagesRead.length} escapes=${metrics.escapes.length}${metrics.contaminated ? " CONTAMINATED" : ""}`,
    );
    return Promise.resolve({
      ...base,
      skipped: false,
      docPagesRead: metrics.docPagesRead.length,
      escapes: metrics.escapes.length,
      bashErrors: metrics.bashCommands.filter((b) => b.isError).length,
      contaminated: metrics.contaminated,
    });
  },
});
