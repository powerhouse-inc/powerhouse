import {
  isCatchingUp,
  rankSlowest,
  renderDoneSummary,
  renderSlowLine,
  type InspectorProcessorTimingReport,
} from "@powerhousedao/reactor";

const TOP = 5;

export type ProcessorTimingLogOptions = {
  intervalMs: number;
  read: () => InspectorProcessorTimingReport;
  log: (line: string) => void;
  now?: () => number;
};

/**
 * The console's `catch-up slowest` line for a host without the ph-cli display:
 * one every interval while catching up, and one summary when it ends. Silent
 * while timing is off or nothing is catching up. Returns the stop.
 */
export function startProcessorTimingLog(
  options: ProcessorTimingLogOptions,
): () => void {
  const now = options.now ?? (() => Date.now());
  let busySince: number | undefined;

  const tick = () => {
    const report = options.read();
    if (report.level === "off") return;
    if (isCatchingUp(report)) {
      busySince ??= now();
      const rows = rankSlowest(report, TOP, "window");
      if (rows.length > 0) options.log(renderSlowLine(rows, report.windowMs));
      return;
    }
    if (busySince === undefined) return;
    const wallMs = now() - busySince;
    busySince = undefined;
    options.log(renderDoneSummary(rankSlowest(report, TOP, "total"), wallMs));
  };

  const timer = setInterval(tick, options.intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
