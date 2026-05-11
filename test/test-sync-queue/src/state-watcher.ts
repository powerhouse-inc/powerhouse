import { bold, cyan, dim, green, magenta, red, yellow } from "colorette";
import { EventRing } from "./event-ring.js";
import type { SyncDriver } from "./sync-driver.js";
import type {
  DriverState,
  EnvelopeSummary,
  EventKind,
  InboxAddedDetail,
  ObservedEvent,
  WatcherConfig,
} from "./types.js";

interface DocTracker {
  documentType: string;
  hasCreate: boolean;
  firstIndexSeen: number;
  lastIndexSeen: number;
  envelopeCount: number;
  orphanEnvelopeCount: number;
}

const PROGRESS_EVENTS: ReadonlySet<EventKind> = new Set<EventKind>([
  "INBOX_ADDED",
  "INBOX_REMOVED",
  "OUTBOX_ADDED",
  "OUTBOX_REMOVED",
  "DEADLETTER_ADDED",
  "JOB_PENDING",
  "JOB_RUNNING",
  "JOB_WRITE_READY",
  "JOB_FAILED",
  "SYNC_PENDING",
  "SYNC_SUCCEEDED",
  "SYNC_FAILED",
]);

export class StateWatcher {
  private readonly driver: SyncDriver;
  private readonly config: WatcherConfig;
  private readonly ring: EventRing;
  private readonly docTrackers = new Map<string, DocTracker>();
  private stopRequested = false;
  private lastEventAt = 0;

  constructor(driver: SyncDriver, config: WatcherConfig) {
    this.driver = driver;
    this.config = config;
    this.ring = new EventRing(config.ringBufferSize);
    this.docTrackers.set(driver.getDriveId(), {
      documentType: "powerhouse/document-drive",
      hasCreate: true,
      firstIndexSeen: -1,
      lastIndexSeen: -1,
      envelopeCount: 0,
      orphanEnvelopeCount: 0,
    });
    this.driver.onEvent((event) => this.onEvent(event));
  }

  stop(): void {
    this.stopRequested = true;
  }

  async run(): Promise<void> {
    let pollCount = 0;
    while (!this.stopRequested) {
      pollCount += 1;
      const stateBefore = await this.driver.getState();
      const { inboxLatestBefore, inboxLatestAfter } = this.driver.pollOnce();
      const stateAfter = await this.driver.getState();
      const newOrdinals = inboxLatestAfter - inboxLatestBefore;

      logSection(`poll #${pollCount}`);
      console.log(
        `  ${dim("inbox latest")} ${inboxLatestBefore} -> ${inboxLatestAfter}  ${dim(
          "(+",
        )}${newOrdinals}${dim(")")}`,
      );
      logState("  state pre-poll ", stateBefore);
      logState("  state post-poll", stateAfter);

      const expectsWork =
        newOrdinals > 0 ||
        stateAfter.inbox.size > 0 ||
        stateAfter.outbox.size > 0 ||
        !stateAfter.queueDrained;

      if (!expectsWork) {
        console.log(dim("  no new work; sleeping briefly before next poll"));
        await sleep(Math.min(this.config.drainQuietMs, 1000));
        if (this.config.maxPolls > 0 && pollCount >= this.config.maxPolls) {
          break;
        }
        continue;
      }

      const drainResult = await this.waitForDrainOrStall();
      const finalState = await this.driver.getState();
      if (drainResult === "stall") {
        this.dumpStall(pollCount, finalState);
        break;
      }
      console.log(
        green(
          `  drained in ${formatMs(drainResult.elapsedMs)} after ${drainResult.eventsDuringWait} progress events`,
        ),
      );
      this.dumpDocSummary();

      if (this.config.maxPolls > 0 && pollCount >= this.config.maxPolls) {
        break;
      }
    }
  }

  private onEvent(event: ObservedEvent): void {
    this.ring.push(event);
    if (PROGRESS_EVENTS.has(event.kind)) {
      this.lastEventAt = event.ts;
    }
    if (event.kind === "INBOX_ADDED") {
      this.analyseInboxAdded(event.detail as InboxAddedDetail);
    }
    if (this.config.verbose) {
      console.log(
        dim(formatTs(event.ts)) +
          " " +
          cyan(event.kind.padEnd(24)) +
          " " +
          safeJson(event.detail),
      );
    }
    if (event.kind === "OUTBOX_ADDED") {
      this.dumpReshuffleAndExit(event);
    }
  }

  private dumpReshuffleAndExit(triggerEvent: ObservedEvent): void {
    const detail = triggerEvent.detail as { count: number; ids: string[] };
    const outboxItems = this.driver.getOutboxDetails();
    const triggeredItems = outboxItems.filter((item) =>
      detail.ids.includes(item.id),
    );

    console.log(red("\n========== RESHUFFLE DETECTED =========="));
    console.log(
      red(
        `  client outbox gained ${detail.count} item(s) — this only happens when the source reshuffled an incoming load and looped ops back via effectiveSourceRemote=""`,
      ),
    );
    console.log(red(`  trigger event: OUTBOX_ADDED ${safeJson(detail.ids)}`));

    console.log(yellow("  reshuffled syncOps (the loopback batch):"));
    if (triggeredItems.length === 0) {
      console.log(
        red(
          "    (no matching items found in current outbox — they may have already been drained)",
        ),
      );
    }
    for (const item of triggeredItems) {
      console.log(
        `    syncOp=${item.id} doc=${item.documentId} branch=${item.branch} ops=${item.opCount}`,
      );
      for (const s of item.perScope) {
        console.log(
          `      scope=${s.scope} idx=${s.firstIndex}..${s.lastIndex} ord=${s.firstOrdinal}..${s.lastOrdinal} actions=[${s.actionTypes.join(",")}]`,
        );
      }
    }

    const suspectDocs = new Set(triggeredItems.map((i) => i.documentId));
    if (suspectDocs.size > 0) {
      console.log(yellow("  per-document context (most recent inbox view):"));
      for (const docId of suspectDocs) {
        const tracker = this.docTrackers.get(docId);
        if (tracker) {
          console.log(
            `    doc=${docId} type=${tracker.documentType || "?"} ` +
              `envelopes=${tracker.envelopeCount} ` +
              `idx=${tracker.firstIndexSeen}..${tracker.lastIndexSeen} ` +
              `hasCreate=${tracker.hasCreate}`,
          );
        } else {
          console.log(`    doc=${docId} (no tracker — never seen via inbox)`);
        }
      }
    }

    console.log(
      yellow(
        "  recent events (last 80, most recent at bottom — look for the JOB_WRITE_READY that produced these ops):",
      ),
    );
    const events = this.ring.snapshot().slice(-80);
    for (const event of events) {
      const isTrigger = event === triggerEvent;
      const line =
        "    " +
        dim(formatTs(event.ts)) +
        " " +
        cyan(event.kind.padEnd(24)) +
        " " +
        safeJson(event.detail);
      console.log(isTrigger ? red(line) : line);
    }

    console.log(red("=========================================\n"));

    this.stopRequested = true;
    process.exit(2);
  }

  private analyseInboxAdded(detail: InboxAddedDetail): void {
    for (const env of detail.envelopes) {
      const tracker = this.getOrCreateTracker(env);
      tracker.envelopeCount += 1;
      if (env.hasCreate) {
        tracker.hasCreate = true;
      }
      if (
        tracker.firstIndexSeen < 0 ||
        env.firstIndex < tracker.firstIndexSeen
      ) {
        tracker.firstIndexSeen = env.firstIndex;
      }
      if (env.lastIndex > tracker.lastIndexSeen) {
        tracker.lastIndexSeen = env.lastIndex;
      }

      const isOrphan = !tracker.hasCreate;
      const indexZeroNoCreate = env.firstIndex === 0 && !env.hasCreate;
      if (isOrphan) {
        tracker.orphanEnvelopeCount += 1;
      }

      this.logEnvelope(env, isOrphan, indexZeroNoCreate);
    }
  }

  private getOrCreateTracker(env: EnvelopeSummary): DocTracker {
    let tracker = this.docTrackers.get(env.documentId);
    if (!tracker) {
      tracker = {
        documentType: env.documentType,
        hasCreate: false,
        firstIndexSeen: -1,
        lastIndexSeen: -1,
        envelopeCount: 0,
        orphanEnvelopeCount: 0,
      };
      this.docTrackers.set(env.documentId, tracker);
    } else if (!tracker.documentType && env.documentType) {
      tracker.documentType = env.documentType;
    }
    return tracker;
  }

  private logEnvelope(
    env: EnvelopeSummary,
    isOrphan: boolean,
    indexZeroNoCreate: boolean,
  ): void {
    const tag = isOrphan
      ? bold(red("ORPHAN"))
      : indexZeroNoCreate
        ? bold(magenta("NO-CREATE@0"))
        : env.hasCreate
          ? green("CREATE")
          : dim("ok");
    const line =
      `    ${tag.padEnd(20)} ` +
      `doc=${env.documentId.slice(0, 8)} ` +
      `type=${env.documentType || "?"} ` +
      `branch=${env.branch} ` +
      `scopes=[${env.scopes.join(",")}] ` +
      `ops=${env.opCount} ` +
      `idx=${env.firstIndex}..${env.lastIndex} ` +
      `ord=${env.firstOrdinal}..${env.lastOrdinal} ` +
      `actions=[${env.actionTypes.join(",")}]`;
    console.log(isOrphan ? red(line) : line);
  }

  private dumpDocSummary(): void {
    if (this.docTrackers.size === 0) return;
    console.log(yellow("  per-document envelope summary:"));
    const rows = [...this.docTrackers.entries()].sort((a, b) => {
      const ao = a[1].orphanEnvelopeCount > 0 ? 0 : 1;
      const bo = b[1].orphanEnvelopeCount > 0 ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return b[1].envelopeCount - a[1].envelopeCount;
    });
    for (const [docId, t] of rows) {
      const flag = !t.hasCreate
        ? red("MISSING-CREATE")
        : t.orphanEnvelopeCount > 0
          ? yellow("recovered")
          : green("ok");
      console.log(
        `    ${flag.padEnd(20)} ` +
          `doc=${docId} ` +
          `type=${t.documentType || "?"} ` +
          `envelopes=${t.envelopeCount} ` +
          `orphan=${t.orphanEnvelopeCount} ` +
          `idx=${t.firstIndexSeen}..${t.lastIndexSeen} ` +
          `hasCreate=${t.hasCreate}`,
      );
    }
  }

  private async waitForDrainOrStall(): Promise<
    "stall" | { elapsedMs: number; eventsDuringWait: number }
  > {
    const start = Date.now();
    let progressEventsAtStart = this.eventCountForKinds(PROGRESS_EVENTS);

    while (true) {
      const state = await this.driver.getState();
      const drained =
        state.queueDrained && state.inbox.size === 0 && state.outbox.size === 0;

      if (drained) {
        const quietStart = Date.now();
        while (Date.now() - quietStart < this.config.drainQuietMs) {
          await sleep(100);
          if (this.lastEventAt > quietStart) {
            // activity resumed - keep waiting
            break;
          }
        }
        const recheck = await this.driver.getState();
        const stillDrained =
          recheck.queueDrained &&
          recheck.inbox.size === 0 &&
          recheck.outbox.size === 0;
        if (
          stillDrained &&
          Date.now() - quietStart >= this.config.drainQuietMs
        ) {
          const eventsDuringWait =
            this.eventCountForKinds(PROGRESS_EVENTS) - progressEventsAtStart;
          return {
            elapsedMs: Date.now() - start,
            eventsDuringWait,
          };
        }
        progressEventsAtStart = this.eventCountForKinds(PROGRESS_EVENTS);
      }

      const lastProgressAt = Math.max(start, this.lastEventAt);
      const sinceLastEvent = Date.now() - lastProgressAt;

      if (sinceLastEvent > this.config.stallTimeoutMs) {
        return "stall";
      }

      await sleep(250);
    }
  }

  private eventCountForKinds(kinds: ReadonlySet<EventKind>): number {
    let count = 0;
    for (const event of this.ring.snapshot()) {
      if (kinds.has(event.kind)) count += 1;
    }
    return count;
  }

  private dumpStall(pollCount: number, state: DriverState): void {
    console.log(red("\n========== STALL DETECTED =========="));
    console.log(red(`  after poll #${pollCount}`));
    console.log(yellow("  current state:"));
    logState("    ", state);
    console.log(yellow("  hypothesis:"));
    if (state.inbox.size > 0) {
      const recent = this.ring.snapshot().slice(-50);
      const sawJobPending = recent.some((e) => e.kind === "JOB_PENDING");
      if (!sawJobPending) {
        console.log(
          red(
            "    inbox has items but no JOB_PENDING fired - routing in SyncManager.handleInboxAdded suspect",
          ),
        );
      } else {
        const lastPending = lastEventByKind(recent, "JOB_PENDING");
        const lastWriteReady = lastEventByKind(recent, "JOB_WRITE_READY");
        const lastFailed = lastEventByKind(recent, "JOB_FAILED");
        const lastInboxRemoved = lastEventByKind(recent, "INBOX_REMOVED");
        if (
          lastPending &&
          (!lastWriteReady || lastWriteReady.ts < lastPending.ts) &&
          (!lastFailed || lastFailed.ts < lastPending.ts)
        ) {
          console.log(
            red(
              "    JOB_PENDING fired but no matching JOB_WRITE_READY / JOB_FAILED - executor or queue wedged",
            ),
          );
        } else if (
          lastWriteReady &&
          (!lastInboxRemoved || lastInboxRemoved.ts < lastWriteReady.ts)
        ) {
          console.log(
            red(
              "    JOB_WRITE_READY fired but inbox.onRemoved did not - ack/cleanup bug in SyncManager",
            ),
          );
        } else {
          console.log(
            yellow("    inbox stuck for unclear reason - inspect ring buffer"),
          );
        }
      }
    } else if (!state.queueDrained || state.queueTotal > 0) {
      console.log(
        red(
          "    queue has pending jobs but not draining - executor stalled or per-document serialization wedge",
        ),
      );
    } else if (state.outbox.size > 0) {
      console.log(
        red(
          "    outbox has items but never sent - GqlRequestChannel push or BatchAggregator suspect",
        ),
      );
    }

    this.dumpDocSummary();
    console.log(yellow("  recent events (most recent last):"));
    const events = this.ring.snapshot();
    for (const event of events) {
      console.log(
        "    " +
          dim(formatTs(event.ts)) +
          " " +
          cyan(event.kind.padEnd(24)) +
          " " +
          safeJson(event.detail),
      );
    }
    console.log(red("====================================\n"));
  }
}

function lastEventByKind(
  events: ObservedEvent[],
  kind: EventKind,
): ObservedEvent | undefined {
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i].kind === kind) return events[i];
  }
  return undefined;
}

function logSection(title: string): void {
  console.log("");
  console.log(yellow(`--- ${title} ---`));
}

function logState(prefix: string, state: DriverState): void {
  console.log(
    `${prefix} inbox(size=${state.inbox.size}, ack=${state.inbox.ackOrdinal}, latest=${state.inbox.latestOrdinal}) ` +
      `outbox(size=${state.outbox.size}, ack=${state.outbox.ackOrdinal}, latest=${state.outbox.latestOrdinal}) ` +
      `dl(size=${state.deadLetter.size}) queue(total=${state.queueTotal}, drained=${state.queueDrained})`,
  );
}

function formatTs(ts: number): string {
  const d = new Date(ts);
  return d.toISOString().slice(11, 23);
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
