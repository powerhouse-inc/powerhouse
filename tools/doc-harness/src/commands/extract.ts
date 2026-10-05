import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { compactTranscript } from "../lib/compact.js";
import { Metrics } from "../lib/schemas.js";
import { extractMetrics, parseTranscriptLines } from "../lib/transcript.js";

type Options = {
  workspace: string;
  docs: string;
  denied?: string[];
  json?: boolean;
  compact?: string;
};

export function register(program: Command): void {
  program
    .command("extract")
    .description("Compute metrics.json fields from a claude -p transcript")
    .argument("<transcript>", "stream-json or session .jsonl")
    .requiredOption("--workspace <dir>", "the builder's cwd")
    .requiredOption("--docs <dir>", "the docs snapshot root")
    .option("--denied <roots...>", "roots the builder was denied", [])
    .option("--json", "print the Metrics object instead of a summary")
    .option(
      "--compact <out.md>",
      "also write the judge-facing compact transcript",
    )
    .action((transcript: string, opts: Options) => {
      const file = path.resolve(transcript);
      const { records, badLines } = parseTranscriptLines(
        readFileSync(file, "utf8"),
      );
      const metrics = Metrics.parse(
        extractMetrics(records, {
          workspaceDir: opts.workspace,
          docsDir: opts.docs,
          deniedRoots: opts.denied ?? [],
        }),
      );
      if (opts.compact !== undefined) {
        writeFileSync(path.resolve(opts.compact), compactTranscript(records));
      }
      if (opts.json === true) {
        process.stdout.write(`${JSON.stringify(metrics, null, 2)}\n`);
        return;
      }
      process.stdout.write(summary(metrics, badLines));
    });
}

function summary(m: Metrics, badLines: number): string {
  const lines: string[] = [];
  lines.push(
    `format ${m.format}  cli ${m.cliVersion ?? "?"}  model ${m.model ?? "?"}`,
  );
  lines.push(
    `turns ${m.turns}  assistant records ${m.assistantMessages}  cost ${m.costUsd ?? "?"}  duration_ms ${m.durationMs ?? "?"}`,
  );
  lines.push(
    `tokens in ${m.tokens.input} out ${m.tokens.output} cache+ ${m.tokens.cacheCreation} cache~ ${m.tokens.cacheRead}`,
  );
  if (badLines > 0) lines.push(`bad lines ${badLines}`);
  lines.push("", "tools");
  for (const [name, count] of Object.entries(m.toolHistogram).sort())
    lines.push(`  ${name.padEnd(12)} ${count}`);
  lines.push("", `doc pages read (${m.docPagesRead.length})`);
  for (const p of m.docPagesRead)
    lines.push(
      `  t${String(p.firstTurn).padStart(3)} ${p.via.padEnd(5)} ${p.rel}`,
    );
  lines.push("", `escapes (${m.escapes.length})`);
  for (const e of m.escapes)
    lines.push(
      `  t${String(e.turn).padStart(3)} ${e.kind.padEnd(18)} ${e.detail}`,
    );
  lines.push(
    "",
    `bash ${m.bashCommands.length} commands, ${m.bashCommands.filter((b) => b.isError).length} failed; error tool results ${m.errorToolResults}`,
  );
  for (const r of m.retryLoops) lines.push(`  retry x${r.count}: ${r.cmd}`);
  lines.push("", `symbols (${m.symbols.length})`);
  for (const s of m.symbols)
    lines.push(
      `  t${String(s.firstUseTurn).padStart(3)} ${s.pkg} ${s.name}${s.docPage === null ? "" : `  doc ${s.docPage}`}`,
    );
  lines.push(
    "",
    `doc gaps stated: ${m.docGapsStated === null ? "no" : "yes"}`,
    `contaminated: ${String(m.contaminated)}`,
    "",
  );
  return lines.join("\n");
}
