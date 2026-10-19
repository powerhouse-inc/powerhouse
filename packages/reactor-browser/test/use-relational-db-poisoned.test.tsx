import { PGlite } from "@electric-sql/pglite";
import { sql } from "kysely";
import { afterEach, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { setPGliteDB } from "../src/pglite/usePGlite.js";
import { useRelationalDb } from "../src/relational/hooks/useRelationalDb.js";
import { relationalKysely } from "../src/relational/utils/relational-dialect.js";

const opened: PGlite[] = [];

afterEach(async () => {
  setPGliteDB({ db: null, isLoading: false, error: null });
  for (const pg of opened.splice(0)) {
    await pg.close().catch(() => undefined);
  }
});

function deadSession() {
  const pg = new PGlite();
  opened.push(pg);
  return {
    query: (text: string, params?: unknown[]) =>
      /dead_call/.test(text)
        ? new Promise<never>(() => undefined)
        : pg.query(text, params),
    exec: (text: string) => pg.exec(text),
    isInTransaction: () => pg.isInTransaction(),
    live: {},
  };
}

describe("useRelationalDb onPoisoned", () => {
  it("tells every mounted hook, and not one that unmounted", async () => {
    const dead = deadSession();
    const db = relationalKysely(dead, {
      statementTimeoutMs: 50,
      onDiagnostic: () => undefined,
    });
    setPGliteDB({ db: dead as never, isLoading: false, error: null });

    const first: Error[] = [];
    const second: Error[] = [];
    const gone: Error[] = [];
    const onFirst = (cause: Error) => first.push(cause);
    const onSecond = (cause: Error) => second.push(cause);
    const onGone = (cause: Error) => gone.push(cause);
    await renderHook(() => useRelationalDb({ onPoisoned: onFirst }));
    await renderHook(() => useRelationalDb({ onPoisoned: onSecond }));
    const unmounted = await renderHook(() =>
      useRelationalDb({ onPoisoned: onGone }),
    );
    await unmounted.unmount();

    await expect(sql`select 1 as dead_call`.execute(db)).rejects.toThrow();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(gone).toEqual([]);
  });

  it("calls an inline callback once across re-renders after the poison", async () => {
    const dead = deadSession();
    const db = relationalKysely(dead, {
      statementTimeoutMs: 50,
      onDiagnostic: () => undefined,
    });
    setPGliteDB({ db: dead as never, isLoading: false, error: null });

    const calls: Error[] = [];
    const hook = await renderHook(() =>
      useRelationalDb({ onPoisoned: (cause) => calls.push(cause) }),
    );

    await expect(sql`select 1 as dead_call`.execute(db)).rejects.toThrow();
    await hook.rerender();
    await hook.rerender();
    expect(calls).toHaveLength(1);
  });
});
