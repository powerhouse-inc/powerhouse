import {
  deriveOperationId,
  generateId,
} from "@powerhousedao/shared/document-model";
import { sql, type Kysely } from "kysely";
import { vi } from "vitest";
import type { OperationIndexEntry } from "../../src/cache/operation-index-types.js";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../src/events/types.js";
import type { ISettledWatermark } from "../../src/catch-up/types.js";
import type { Database } from "../../src/storage/kysely/types.js";

export function indexEntry(
  documentId: string,
  index: number,
  scope = "global",
): OperationIndexEntry {
  const actionId = generateId();
  return {
    id: deriveOperationId(documentId, scope, "main", actionId),
    documentId,
    documentType: "powerhouse/document-model",
    branch: "main",
    scope,
    sourceRemote: "",
    index,
    timestampUtcMs: "1704067200000",
    hash: `hash-${index}`,
    skip: 0,
    action: {
      id: actionId,
      type: "SET_NAME",
      scope,
      timestampUtcMs: "1704067200000",
      input: { name: `name-${index}` },
    },
  };
}

type DropRule = {
  matches: (event: JobWriteReadyEvent) => boolean;
  resolve: (event: JobWriteReadyEvent) => void;
};

/** Drops one matching JOB_WRITE_READY before any subscriber sees it. */
export class DroppingEventBus extends EventBus {
  private readonly rules: DropRule[] = [];

  dropWriteReady(
    matches: (event: JobWriteReadyEvent) => boolean,
  ): Promise<JobWriteReadyEvent> {
    return new Promise((resolve) => {
      this.rules.push({ matches, resolve });
    });
  }

  dropWriteReadyFor(documentId: string): Promise<JobWriteReadyEvent> {
    return this.dropWriteReady((event) =>
      event.operations.some((op) => op.context.documentId === documentId),
    );
  }

  override async emit(type: number, data: unknown): Promise<void> {
    if (type === ReactorEventTypes.JOB_WRITE_READY) {
      const event = data as JobWriteReadyEvent;
      const index = this.rules.findIndex((rule) => rule.matches(event));
      if (index !== -1) {
        const [rule] = this.rules.splice(index, 1);
        rule!.resolve(event);
        return;
      }
    }
    return super.emit(type, data);
  }
}

export type IndexCommitHold = {
  /** Resolves once a job for the document took its ordinal and is waiting. */
  waitUntilHeld(timeoutMs?: number): Promise<void>;
  release(): Promise<void>;
  remove(): Promise<void>;
};

let holdCounter = 0;

/** Stops a job for `documentId` after it takes its ordinal. Postgres only. */
export async function holdIndexCommit(
  db: Kysely<Database>,
  documentId: string,
): Promise<IndexCommitHold> {
  const classKey = 7_431_001;
  const objKey = ++holdCounter + (process.pid % 100_000) * 1000;
  const table = tableName(db);
  const suffix = `${process.pid}_${holdCounter}`;
  const fn = `${table.schema}.catchup_hold_${suffix}`;
  const trigger = `catchup_hold_${suffix}`;

  await sql
    .raw(
      `create function ${fn}() returns trigger language plpgsql as $$
       begin
         if NEW."documentId" = '${documentId.replace(/'/g, "''")}' then
           perform pg_advisory_lock(${classKey}, ${objKey});
           perform pg_advisory_unlock(${classKey}, ${objKey});
         end if;
         return NEW;
       end $$`,
    )
    .execute(db);
  await sql
    .raw(
      `create trigger ${trigger} after insert on ${table.qualified}
       for each row execute function ${fn}()`,
    )
    .execute(db);

  let releaseLock!: () => void;
  const released = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  let lockTaken!: () => void;
  const taken = new Promise<void>((resolve) => {
    lockTaken = resolve;
  });
  const holding = db.connection().execute(async (conn) => {
    await sql`select pg_advisory_lock(${classKey}, ${objKey})`.execute(conn);
    lockTaken();
    await released;
    await sql`select pg_advisory_unlock(${classKey}, ${objKey})`.execute(conn);
  });
  await taken;

  let isReleased = false;
  const release = async () => {
    if (isReleased) return;
    isReleased = true;
    releaseLock();
    await holding;
  };

  return {
    waitUntilHeld: async (timeoutMs = 10_000) => {
      await vi.waitUntil(
        async () => {
          const result = await sql<{ waiting: string | number }>`
            select count(*) as waiting from pg_locks
            where locktype = 'advisory' and not granted
              and classid = ${classKey} and objid = ${objKey} and objsubid = 2
          `.execute(db);
          return Number(result.rows[0]!.waiting) > 0;
        },
        { timeout: timeoutMs, interval: 20 },
      );
    },
    release,
    remove: async () => {
      await release();
      await sql
        .raw(`drop trigger if exists ${trigger} on ${table.qualified}`)
        .execute(db);
      await sql.raw(`drop function if exists ${fn}()`).execute(db);
    },
  };
}

function tableName(db: Kysely<Database>): {
  schema: string;
  qualified: string;
} {
  const compiled = db
    .selectFrom("operation_index_operations")
    .select("ordinal")
    .compile().sql;
  const match = /from "([^"]+)"\."operation_index_operations"/.exec(compiled);
  const schema = match?.[1] ?? "public";
  return { schema, qualified: `"${schema}"."operation_index_operations"` };
}

/** A watermark that has settled everything, for tests without an index. */
export function settledAtHead(): ISettledWatermark {
  const through = 2_147_483_647;
  return {
    settledThrough: through,
    refresh: () => Promise.resolve(through),
    onAdvance: () => () => {},
    status: () => ({ head: 0, settledThrough: through, waitingOn: [] }),
  };
}
