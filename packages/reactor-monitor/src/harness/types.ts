import type { LinkLocalSyncOptions, LocalSyncHandle } from "../sync/link.js";
import type { ManagedInProcessReactor } from "../types.js";

/**
 * A pre-provisioned, already-linked pair of in-process reactors, for a caller
 * that wants to drive {@link runLocalSyncLoad} against reactors it owns (a
 * durable storage kind, a larger Stage-P profile, a reactor already carrying
 * other data). Owning the pair also means owning its teardown:
 * {@link runLocalSyncLoad} never unlinks or kills a caller-supplied pair.
 */
export type LoadHarnessReactors = {
  a: ManagedInProcessReactor;
  b: ManagedInProcessReactor;
  /** The drive both reactors already sync; load lands on this one document. */
  driveId: string;
  link: LocalSyncHandle;
};

/** What {@link runLocalSyncLoad} generates and how it measures doing so. */
export type LoadHarnessOptions = {
  /** How many logical "documents" worth of load to generate. */
  documentCount: number;
  /** Operations generated per document; `documentCount * opsPerDocument` total. */
  opsPerDocument: number;
  /**
   * Extra characters appended to every generated op's name, to approximate a
   * larger action payload. Defaults to 0 (the bare name).
   */
  payloadSize?: number;
  /**
   * Drives the load against an already-linked pair instead of provisioning
   * and linking a fresh one. Omit for a self-contained small-load test; pass
   * this for a Stage-P profile run against reactors built with realistic
   * storage.
   */
  reactors?: LoadHarnessReactors;
  /** Forwarded to {@link linkLocalSync} when this call provisions its own pair. */
  createChannel?: LinkLocalSyncOptions["createChannel"];
  /** How long to wait for B to hold every generated op. Defaults to 30s. */
  propagationTimeoutMs?: number;
  /** Propagation poll interval. Defaults to 25ms. */
  pollIntervalMs?: number;
};

/** Wall-clock duration of each phase, plus their sum. */
export type LoadHarnessDurations = {
  /** Provisioning + linking a fresh pair; 0 when `options.reactors` was given. */
  setupMs: number;
  /** Generating every op on A, sequentially. */
  generateMs: number;
  /** From the end of generation until B holds every op. */
  propagateMs: number;
  totalMs: number;
};

/** Derived rates, the headline numbers a baseline comparison reads first. */
export type LoadHarnessThroughput = {
  createOpsPerSec: number;
  propagateOpsPerSec: number;
};

/**
 * `process.memoryUsage()` snapshots at phase boundaries. One process hosts
 * both reactors in-process, so this is whole-process memory, not a
 * per-reactor split -- the Stage-P memory axis's starting instrument.
 */
export type LoadHarnessMemorySamples = {
  baseline: NodeJS.MemoryUsage;
  afterGenerate: NodeJS.MemoryUsage;
  afterPropagate: NodeJS.MemoryUsage;
};

/**
 * Approximate DB footprint: `Operation` rows for the load drive on each side,
 * read through `dbQuery` so no reactor needs a bespoke counting method.
 */
export type LoadHarnessOperationCounts = {
  a: number;
  b: number;
};

/**
 * The Stage-P baseline record: stable field names, plain data, JSON-
 * serializable, so a run can be dumped to disk and diffed against a later one.
 */
export type LoadHarnessReport = {
  documentCount: number;
  opsPerDocument: number;
  payloadSize: number;
  totalOps: number;
  durationsMs: LoadHarnessDurations;
  throughput: LoadHarnessThroughput;
  operationCounts: LoadHarnessOperationCounts;
  memory: LoadHarnessMemorySamples;
  driveId: string;
  reactorNames: { a: string; b: string };
};
