import { blue, bold, gray, green, red, yellow } from "colorette";
import type { Statistics } from "../types.js";

export class Reporter {
  private lastProgressLength = 0;

  clearProgress(): void {
    if (this.lastProgressLength > 0) {
      process.stdout.write("\r" + " ".repeat(this.lastProgressLength) + "\r");
    }
  }

  printProgress(
    elapsedSeconds: number,
    totalSeconds: number,
    totalOps: number,
    errors: number,
    avgLatency: number,
  ): void {
    const percent = Math.min(
      100,
      Math.round((elapsedSeconds / totalSeconds) * 100),
    );
    const barLength = 30;
    const filled = Math.round((percent / 100) * barLength);
    const empty = barLength - filled;

    const bar = green("=".repeat(filled)) + gray("-".repeat(empty));
    const errorText =
      errors > 0 ? red(`Errors: ${errors}`) : green("Errors: 0");

    const progress = `[${bar}] ${percent}% | Ops: ${totalOps} | ${errorText} | Avg: ${avgLatency}ms`;

    this.clearProgress();
    process.stdout.write(progress);
    this.lastProgressLength = progress.length + 20; // Account for ANSI codes
  }

  printSummary(stats: Statistics, durationSeconds: number): void {
    this.clearProgress();
    console.log("\n");
    console.log(bold(blue("========================================")));
    console.log(bold(blue("           LOAD TEST SUMMARY            ")));
    console.log(bold(blue("========================================")));
    console.log();

    console.log(`Duration:           ${durationSeconds.toFixed(1)}s`);
    console.log(`Total Operations:   ${stats.totalOperations}`);

    const successRate =
      stats.totalOperations > 0
        ? ((stats.successfulOperations / stats.totalOperations) * 100).toFixed(
            1,
          )
        : "0.0";
    console.log(
      `Successful:         ${green(String(stats.successfulOperations))} (${successRate}%)`,
    );

    if (stats.failedOperations > 0) {
      const failRate = (
        (stats.failedOperations / stats.totalOperations) *
        100
      ).toFixed(1);
      console.log(
        `Failed:             ${red(String(stats.failedOperations))} (${failRate}%)`,
      );
    }

    console.log(`Documents Created:  ${stats.documentsCreated}`);
    console.log();

    console.log(bold("LATENCY (ms)"));
    console.log(
      `  Min:    ${stats.latency.min}    Max:    ${stats.latency.max}`,
    );
    console.log(
      `  Avg:    ${stats.latency.avg}    P95:    ${stats.latency.p95}`,
    );
    console.log();

    console.log(bold("THROUGHPUT"));
    console.log(`  Ops/sec:    ${stats.throughput.opsPerSecond.toFixed(1)}`);
    console.log(`  Docs/min:   ${stats.throughput.docsPerMinute.toFixed(1)}`);

    if (stats.errors.size > 0) {
      console.log();
      console.log(bold(yellow("ERRORS")));
      for (const [error, count] of stats.errors) {
        const truncatedError =
          error.length > 50 ? error.slice(0, 50) + "..." : error;
        console.log(`  ${truncatedError}: ${count} occurrences`);
      }
    }

    console.log();
    console.log(bold(blue("========================================")));
  }

  printError(message: string): void {
    this.clearProgress();
    console.error(red(`Error: ${message}`));
  }

  printInfo(message: string): void {
    this.clearProgress();
    console.log(blue(`Info: ${message}`));
  }

  printVerbose(message: string, verbose: boolean): void {
    if (verbose) {
      this.clearProgress();
      console.log(gray(`[DEBUG] ${message}`));
    }
  }
}
