import {
  type ListenerCallInfo,
  type ListenerFilter,
} from "#drive-document-model/gen/types";
import { type Kysely } from "kysely";
import { type IListenerStorage, type ListenerData } from "../types.js";
import { migrateToLatest } from "./migrate.js";
import { type DB, type JsonValue } from "./schema.js";

export class RelationalListenerStorage implements IListenerStorage {
  constructor(protected db: Kysely<DB>) {}

  static migrateDatabase(db: Kysely<any>) {
    return migrateToLatest(db);
  }

  async init(): Promise<void> {}

  async *getParents(): AsyncIterableIterator<string> {
    const rows = await this.db
      .selectFrom("listener")
      .select("parent_id")
      .distinct()
      .execute();
    for (const row of rows) {
      yield row.parent_id;
    }
  }

  async *getListeners(parentId: string): AsyncIterableIterator<string> {
    const rows = await this.db
      .selectFrom("listener")
      .select("listener_id")
      .where("parent_id", "=", parentId)
      .execute();
    for (const row of rows) {
      yield row.listener_id;
    }
  }

  async getListener(
    parentId: string,
    listenerId: string,
  ): Promise<ListenerData | null> {
    const row = await this.db
      .selectFrom("listener")
      .selectAll()
      .where("parent_id", "=", parentId)
      .where("listener_id", "=", listenerId)
      .executeTakeFirst();
    if (!row) return null;
    return this.rowToListenerData(row);
  }

  async hasListeners(parentId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("listener")
      .select("listener_id")
      .where("parent_id", "=", parentId)
      .limit(1)
      .executeTakeFirst();
    return !!row;
  }

  async hasListener(parentId: string, listenerId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom("listener")
      .select("listener_id")
      .where("parent_id", "=", parentId)
      .where("listener_id", "=", listenerId)
      .limit(1)
      .executeTakeFirst();
    return !!row;
  }

  async addListener(
    parentId: string,
    listenerId: string,
    listenerState: ListenerData,
  ): Promise<void> {
    await this.db
      .insertInto("listener")
      .values({
        parent_id: parentId,
        listener_id: listenerId,
        label: listenerState.label ?? null,
        block: listenerState.block,
        system: listenerState.system,
        filter: listenerState.filter,
        call_info: listenerState.callInfo ?? null,
      })
      .execute();
  }

  async updateListener(
    parentId: string,
    listenerId: string,
    listenerState: ListenerData,
  ): Promise<void> {
    await this.db
      .updateTable("listener")
      .set({
        label: listenerState.label ?? null,
        block: listenerState.block,
        system: listenerState.system,
        filter: listenerState.filter,
        call_info: listenerState.callInfo ?? null,
      })
      .where("parent_id", "=", parentId)
      .where("listener_id", "=", listenerId)
      .execute();
  }
  async removeListeners(parentId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("listener")
      .where("parent_id", "=", parentId)
      .executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  async removeListener(parentId: string, listenerId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("listener")
      .where("parent_id", "=", parentId)
      .where("listener_id", "=", listenerId)
      .executeTakeFirst();
    return result.numDeletedRows > 0;
  }

  /**
   * Convert a DB row to ListenerData (Omit<Listener, 'transmitter'>)
   */
  private rowToListenerData(row: {
    listener_id: string;
    block: boolean;
    call_info: JsonValue;
    filter: JsonValue;
    label: string | null;
    parent_id: string;
    system: boolean;
  }): ListenerData {
    const listener: ListenerData = {
      driveId: row.parent_id,
      listenerId: row.listener_id,
      block: row.block,
      system: row.system,
      filter: row.filter as ListenerFilter,
    };
    if (row.label) {
      listener.label = row.label;
    }
    if (row.call_info) {
      listener.callInfo = row.call_info as ListenerCallInfo;
    }
    return listener;
  }
}
