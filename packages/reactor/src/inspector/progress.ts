import type { ProcessorPhase } from "@powerhousedao/shared/processors";
import type { CatchUpStatus, CatchUpThread } from "../catch-up/types.js";
import type { InspectorProcessorInfo } from "./types.js";

/** The catch-up consumer that stands for every processor; shown per factory instead. */
export const PROCESSOR_MANAGER_CONSUMER_ID = "processor-manager";

/** How far one processor's current replay has got, in ordinals scanned. */
export type ProcessorProgress = {
  processorId: string;
  driveId: string;
  processorIndex: number;
  phase: ProcessorPhase;
  runFrom: number;
  lastOrdinal: number;
  /** Ordinals scanned since the run began, within `0..total`. */
  done: number;
  /** Ordinals from the run start to the head; 0 once live. */
  total: number;
  /** `done / total` within `0..1`; 1 when there is nothing to scan. */
  fraction: number;
};

/** One factory's processors, summed. */
export type FactoryProgress = {
  factoryId: string;
  /** A short name: a factory id that is a project path is named by its folder. */
  label: string;
  /** Distinct drives among `processors`. */
  driveCount: number;
  /** Errored if any is, else catching up if any is, else live. */
  phase: ProcessorPhase;
  /** Ordinals scanned and to scan, summed over the processors replaying now. */
  done: number;
  total: number;
  /** The mean of its processors' fractions: a live one counts as complete. */
  fraction: number;
  /** Its processors that are live. */
  processorsDone: number;
  processors: ProcessorProgress[];
};

/** One reactor read model's position against the head. */
export type ReadModelProgress = {
  consumerId: string;
  thread: CatchUpThread;
  appliedThrough: number;
  head: number;
  /** `appliedThrough / head` within `0..1`; 1 once complete. */
  fraction: number;
  complete: boolean;
  /** Whether a sweep is stuck on an operation it cannot apply. */
  blocked: boolean;
};

export type ReactorProgress = {
  head: number;
  /** False when no catch-up status was given and `head` is the highest cursor. */
  headKnown: boolean;
  factories: FactoryProgress[];
  readModels: ReadModelProgress[];
};

/**
 * Turns processor cursors and the catch-up head into progress bars: one per
 * processor, averaged per factory (project factories first), and one per
 * reactor read model. A live
 * processor has no run in progress, so it counts as complete whatever its lag.
 * Without a catch-up status the head is taken as the highest cursor.
 */
export function computeProgress(
  processors: readonly InspectorProcessorInfo[],
  catchUp: CatchUpStatus | undefined,
): ReactorProgress {
  const headKnown = catchUp !== undefined;
  const head = headKnown
    ? catchUp.watermark.head
    : processors.reduce((top, info) => Math.max(top, info.lastOrdinal), 0);

  const byFactory = new Map<string, ProcessorProgress[]>();
  for (const info of processors) {
    const rows = byFactory.get(info.factoryId) ?? [];
    rows.push(processorProgress(info, head));
    byFactory.set(info.factoryId, rows);
  }
  const factories = [...byFactory.entries()]
    .sort(
      ([a], [b]) =>
        Number(isProjectPath(b)) - Number(isProjectPath(a)) ||
        a.localeCompare(b),
    )
    .map(([factoryId, rows]) => factoryProgress(factoryId, rows));

  const readModels = (catchUp?.consumers ?? [])
    .filter((consumer) => consumer.consumerId !== PROCESSOR_MANAGER_CONSUMER_ID)
    .map((consumer): ReadModelProgress => ({
      consumerId: consumer.consumerId,
      thread: consumer.thread,
      appliedThrough: consumer.appliedThrough,
      head,
      fraction: head <= 0 ? 1 : clamp(consumer.appliedThrough / head),
      complete: consumer.appliedThrough >= head,
      blocked: consumer.blockedAt !== undefined,
    }));

  return { head, headKnown, factories, readModels };
}

function processorProgress(
  info: InspectorProcessorInfo,
  head: number,
): ProcessorProgress {
  const total = info.phase === "live" ? 0 : Math.max(0, head - info.runFrom);
  const done = Math.min(total, Math.max(0, info.lastOrdinal - info.runFrom));
  return {
    processorId: info.processorId,
    driveId: info.driveId,
    processorIndex: info.processorIndex,
    phase: info.phase,
    runFrom: info.runFrom,
    lastOrdinal: info.lastOrdinal,
    done,
    total,
    fraction: fractionOf(
      done,
      total,
      info.phase === "catching-up" && head >= info.runFrom,
    ),
  };
}

function factoryProgress(
  factoryId: string,
  rows: ProcessorProgress[],
): FactoryProgress {
  rows.sort(
    (a, b) =>
      a.driveId.localeCompare(b.driveId) || a.processorIndex - b.processorIndex,
  );
  let done = 0;
  let total = 0;
  for (const row of rows) {
    done += row.done;
    total += row.total;
  }
  const fractions = rows.reduce((sum, row) => sum + row.fraction, 0);
  return {
    factoryId,
    label: factoryLabel(factoryId),
    driveCount: new Set(rows.map((row) => row.driveId)).size,
    phase: aggregatePhase(rows),
    done,
    total,
    fraction: rows.length === 0 ? 1 : clamp(fractions / rows.length),
    processorsDone: rows.filter((row) => row.phase === "live").length,
    processors: rows,
  };
}

/** A factory registered by a project is keyed by its folder; a package's by its name. */
function isProjectPath(factoryId: string): boolean {
  return /^(?:[A-Za-z]:[\\/]|\/)/.test(factoryId);
}

function factoryLabel(factoryId: string): string {
  return factoryId.split(/[\\/]/).filter(Boolean).at(-1) ?? factoryId;
}

function aggregatePhase(rows: ProcessorProgress[]): ProcessorPhase {
  if (rows.some((row) => row.phase === "errored")) return "errored";
  if (rows.some((row) => row.phase === "catching-up")) return "catching-up";
  return "live";
}

/** Nothing to scan is complete, unless a replay is queued and has yet to start. */
function fractionOf(done: number, total: number, queued: boolean): number {
  if (total > 0) return clamp(done / total);
  return queued ? 0 : 1;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}
