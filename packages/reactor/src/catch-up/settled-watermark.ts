import type { ILogger } from "document-model";
import { sql, TableNode, type Kysely } from "kysely";
import type { Unsubscribe } from "../events/types.js";
import type { Database } from "../storage/kysely/types.js";
import type { ISettledWatermark, WatermarkStatus } from "./types.js";

export type SnapshotFunctions = {
  snapshot: string;
  currentXid: string;
  xidIfAssigned: string;
};

export type ParsedSnapshot = { xmin: bigint; xmax: bigint; xip: bigint[] };

export type ProbeReading = {
  head: number;
  snapshot: ParsedSnapshot;
  /** False when the probe ran inside another session's write transaction. */
  outsideWrite: boolean;
};

export type WatermarkProbe = () => Promise<ProbeReading>;

const MAX_PENDING_PROBES = 64;

/** pg_sequence_last_value needs 10; pg_current_* replaced txid_* in 13. */
export function snapshotFunctionsFor(
  serverVersionNum: number,
): SnapshotFunctions {
  if (serverVersionNum >= 130000) {
    return {
      snapshot: "pg_current_snapshot",
      currentXid: "pg_current_xact_id",
      xidIfAssigned: "pg_current_xact_id_if_assigned",
    };
  }
  if (serverVersionNum >= 100000) {
    return {
      snapshot: "txid_current_snapshot",
      currentXid: "txid_current",
      xidIfAssigned: "txid_current_if_assigned",
    };
  }
  throw new Error(
    `PostgreSQL server_version_num ${serverVersionNum} is not supported: read-side catch-up needs 10 or later`,
  );
}

/** Parses the `xmin:xmax:xip,...` text form of a snapshot. */
export function parseSnapshot(text: string): ParsedSnapshot {
  const parts = text.split(":");
  if (parts.length !== 3) {
    throw new Error(`Malformed snapshot: ${text}`);
  }
  const [xmin, xmax, xip] = parts as [string, string, string];
  return {
    xmin: BigInt(xmin),
    xmax: BigInt(xmax),
    xip: xip === "" ? [] : xip.split(",").map((xid) => BigInt(xid)),
  };
}

export async function readSnapshotFunctions<DB>(
  db: Kysely<DB>,
): Promise<SnapshotFunctions> {
  const result = await sql<{
    version: string;
  }>`select current_setting('server_version_num') as version`.execute(db);
  return snapshotFunctionsFor(Number(result.rows[0]!.version));
}

type PendingProbe = {
  head: number;
  openMax: bigint | null;
  xip: bigint[];
  takenAtUtcMs: number;
};

/** A probe settles once a later xmin passes the highest xid open at it. */
export class ProbeSettler {
  private settled = 0;
  private lastHead = 0;
  private lastXmin = 0n;
  private pending: PendingProbe[] = [];

  get settledThrough(): number {
    return this.settled;
  }

  get head(): number {
    return this.lastHead;
  }

  observe(head: number, snapshot: ParsedSnapshot, nowUtcMs: number): number {
    this.lastHead = Math.max(this.lastHead, head);
    this.lastXmin = snapshot.xmin;

    let openMax: bigint | null = null;
    for (const xid of snapshot.xip) {
      if (openMax === null || xid > openMax) openMax = xid;
    }
    this.pending.push({
      head,
      openMax,
      xip: snapshot.xip,
      takenAtUtcMs: nowUtcMs,
    });
    if (this.pending.length > MAX_PENDING_PROBES) {
      this.pending.shift();
    }

    const stillPending: PendingProbe[] = [];
    for (const probe of this.pending) {
      if (probe.openMax === null || snapshot.xmin > probe.openMax) {
        this.settled = Math.max(this.settled, probe.head);
      } else {
        stillPending.push(probe);
      }
    }
    this.pending = stillPending.filter((probe) => probe.head > this.settled);
    return this.settled;
  }

  /** Xids an unsettled probe still waits on. */
  waitingOn(): string[] {
    if (this.pending.length === 0) return [];
    return this.pending[0]!.xip.filter((xid) => xid >= this.lastXmin).map(
      (xid) => xid.toString(),
    );
  }

  stalledSinceUtcMs(): number | undefined {
    return this.pending[0]?.takenAtUtcMs;
  }
}

function operationIndexTableName(db: Kysely<Database>): string {
  const node = db
    .selectFrom("operation_index_operations")
    .selectAll()
    .toOperationNode();
  const from = node.from?.froms[0];
  const schema =
    from !== undefined && TableNode.is(from)
      ? from.table.schema?.name
      : undefined;
  const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;
  return schema === undefined
    ? quote("operation_index_operations")
    : `${quote(schema)}.${quote("operation_index_operations")}`;
}

/** Reads the sequence head, then a snapshot, in that order. */
export function createKyselyWatermarkProbe(
  db: Kysely<Database>,
): WatermarkProbe {
  let resolved: Promise<{ fns: SnapshotFunctions; sequence: string }> | null =
    null;

  const resolve = async () => {
    const fns = await readSnapshotFunctions(db);
    const table = operationIndexTableName(db);
    const result = await sql<{
      sequence: string | null;
    }>`select pg_get_serial_sequence(${table}, 'ordinal') as sequence`.execute(
      db,
    );
    const sequence = result.rows[0]?.sequence;
    if (!sequence) {
      throw new Error(`No ordinal sequence found for ${table}`);
    }
    return { fns, sequence };
  };

  return async () => {
    resolved ??= resolve().catch((error: unknown) => {
      resolved = null;
      throw error;
    });
    const { fns, sequence } = await resolved;

    const headResult = await sql<{
      head: string | number;
    }>`select coalesce(pg_sequence_last_value(${sequence}::regclass), 0) as head`.execute(
      db,
    );
    const snapshotResult = await sql<{
      snapshot: string;
      outside_write: boolean;
    }>`select ${sql.raw(fns.snapshot)}()::text as snapshot, ${sql.raw(fns.xidIfAssigned)}() is null as outside_write`.execute(
      db,
    );
    const row = snapshotResult.rows[0]!;
    return {
      head: Number(headResult.rows[0]!.head),
      snapshot: parseSnapshot(row.snapshot),
      outsideWrite: row.outside_write,
    };
  };
}

/** Knows when an ordinal gap is final by asking which transactions are open. */
export class SettledWatermark implements ISettledWatermark {
  private readonly settler = new ProbeSettler();
  private readonly listeners = new Set<(settledThrough: number) => void>();
  private current: Promise<number> | undefined;
  private next: Promise<number> | undefined;
  private warnedInsideWrite = false;

  constructor(
    private readonly probe: WatermarkProbe,
    private readonly logger: ILogger,
    private readonly now: () => number = Date.now,
  ) {}

  get settledThrough(): number {
    return this.settler.settledThrough;
  }

  refresh(signal?: AbortSignal): Promise<number> {
    signal?.throwIfAborted();
    if (this.next !== undefined) return this.next;
    if (this.current === undefined) return this.start();

    const next = this.current
      .catch(() => this.settledThrough)
      .then(() => {
        this.next = undefined;
        return this.start();
      });
    this.next = next;
    return next;
  }

  onAdvance(listener: (settledThrough: number) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  status(): WatermarkStatus {
    const stalledSinceUtcMs =
      this.settler.head > this.settledThrough
        ? this.settler.stalledSinceUtcMs()
        : undefined;
    return {
      head: this.settler.head,
      settledThrough: this.settledThrough,
      waitingOn: this.settler.waitingOn(),
      ...(stalledSinceUtcMs !== undefined ? { stalledSinceUtcMs } : {}),
    };
  }

  private start(): Promise<number> {
    const run = this.probeOnce().finally(() => {
      if (this.current === run) this.current = undefined;
    });
    this.current = run;
    return run;
  }

  private async probeOnce(): Promise<number> {
    const reading = await this.probe();
    if (!reading.outsideWrite) {
      if (!this.warnedInsideWrite) {
        this.warnedInsideWrite = true;
        this.logger.warn(
          "settled watermark probe ran inside another session's write transaction; discarded",
        );
      }
      return this.settledThrough;
    }

    const before = this.settledThrough;
    const after = this.settler.observe(
      reading.head,
      reading.snapshot,
      this.now(),
    );
    if (after > before) {
      for (const listener of this.listeners) {
        try {
          listener(after);
        } catch (error) {
          this.logger.error("settled watermark listener failed: @error", error);
        }
      }
    }
    return after;
  }
}
