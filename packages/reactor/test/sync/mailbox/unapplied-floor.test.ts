import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { Mailbox } from "../../../src/sync/mailbox.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";

/** One item holding a single operation at `ordinal`. */
function itemAt(ordinal: number): SyncOperation {
  const operations: OperationWithContext[] = [
    {
      operation: {
        id: `op-${ordinal}`,
        index: ordinal,
        skip: 0,
        hash: `h-${ordinal}`,
        timestampUtcMs: String(ordinal * 1000),
        action: {
          id: `action-${ordinal}`,
          type: "X",
          scope: "global",
          timestampUtcMs: String(ordinal * 1000),
          input: {},
        },
      },
      context: {
        documentId: `doc-${ordinal}`,
        documentType: "test",
        scope: "global",
        branch: "main",
        ordinal,
      },
    } as OperationWithContext,
  ];
  return new SyncOperation(
    `s${ordinal}`,
    `key-${ordinal}`,
    [],
    "remote-1",
    `doc-${ordinal}`,
    ["global"],
    "main",
    operations,
  );
}

function apply(item: SyncOperation): void {
  item.started();
  item.transported();
  item.executed();
}

/**
 * The held ack's floor was memoized in a field that used positive infinity for
 * both "no unapplied item" and "stale, recompute me". Once the floor's own item
 * resolved and wrote the stale marker, the next add() compared its ordinal
 * against infinity, won, and installed itself as the floor -- above an item
 * that was still unapplied. The ack then passed that item, the cursor persisted
 * past it, and a restart never asked the remote for it again.
 */
describe("the held inbox ack's unapplied floor", () => {
  it("keeps the floor at the lowest unapplied item after the old floor resolves", () => {
    const box = new Mailbox();
    box.init(20);

    const first = itemAt(5);
    const second = itemAt(10);
    box.add(first);
    box.add(second);
    expect(box.ackOrdinal).toBe(4);

    apply(first);
    box.remove(first);

    const third = itemAt(12);
    box.add(third);

    // 10 is still unapplied, so the ack must stay below it. Reading 11 here
    // means the floor moved up to the newly added 12.
    expect(box.ackOrdinal).toBe(9);
  });

  it("takes a lower ordinal added after the floor went stale", () => {
    const box = new Mailbox();
    box.init(20);

    const first = itemAt(5);
    const second = itemAt(10);
    box.add(first, second);
    apply(first);
    box.remove(first);

    box.add(itemAt(3));

    expect(box.ackOrdinal).toBe(2);
  });

  it("releases the ack once every held item has resolved", () => {
    const box = new Mailbox();
    box.init(20);

    const first = itemAt(5);
    const second = itemAt(10);
    box.add(first, second);
    apply(first);
    box.remove(first);
    box.add(itemAt(12));
    expect(box.ackOrdinal).toBe(9);

    for (const item of [...box.items]) {
      apply(item);
      box.remove(item);
    }

    expect(box.ackOrdinal).toBe(20);
  });

  it("does not hold the ack for an item that failed", () => {
    const box = new Mailbox();
    box.init(20);

    const first = itemAt(5);
    box.add(first, itemAt(10));
    apply(first);
    box.remove(first);

    const failing = box.get("s10");
    expect(failing).toBeDefined();
    failing?.failed(
      Object.assign(new Error("dead letter"), {
        name: "ChannelError",
      }) as never,
    );

    box.add(itemAt(12));

    expect(box.ackOrdinal).toBe(11);
  });

  it("holds the ack by default, so a channel cannot forget to ask for it", () => {
    const box = new Mailbox();
    box.init(20);
    box.add(itemAt(10));

    expect(box.ackOrdinal).toBe(9);
  });

  it("can be opted out of for a mailbox whose ack no cursor reads", () => {
    const box = new Mailbox({ holdAckBelowUnapplied: false });
    box.init(20);
    box.add(itemAt(10));

    expect(box.ackOrdinal).toBe(20);
  });
});
