import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { Mailbox } from "../../../src/sync/mailbox.js";
import { SyncOperation } from "../../../src/sync/sync-operation.js";
import { purgeMarker } from "../../purge/helpers.js";

const OPS_PER_ITEM = 20;

/** An item whose operations count every read of them. */
function countedItem(
  i: number,
  reads: { count: number },
  marker = false,
): SyncOperation {
  const documentId = `d${i}`;
  const operations = Array.from(
    { length: marker ? 1 : OPS_PER_ITEM },
    (_, k) =>
      ({
        operation: marker
          ? purgeMarker(documentId)
          : {
              id: `o${i}-${k}`,
              index: k,
              skip: 0,
              hash: "",
              timestampUtcMs: "",
              action: {
                id: `a${i}-${k}`,
                type: "X",
                scope: "global",
                timestampUtcMs: "",
                input: {},
              },
            },
        context: {
          documentId,
          documentType: "t",
          scope: marker ? "document" : "global",
          branch: "main",
          ordinal: i * OPS_PER_ITEM + k + 1,
        },
      }) as OperationWithContext,
  );
  const item = new SyncOperation(
    `s${i}`,
    "",
    [],
    "r",
    documentId,
    ["global"],
    "main",
    operations,
  );
  Object.defineProperty(item, "operations", {
    get: () => {
      reads.count++;
      return operations;
    },
  });
  return item;
}

describe("the held inbox ack", () => {
  it("reads only marker items, so a drain stays linear", () => {
    const box = new Mailbox({ holdAckBelowMarkers: true });
    const reads = { count: 0 };
    const items = Array.from({ length: 2_000 }, (_, i) =>
      countedItem(i + 1, reads),
    );
    const marker = countedItem(0, { count: 0 }, true);
    box.add(marker, ...items);
    let lastAck = -1;
    box.onRemoved(() => {
      lastAck = box.ackOrdinal;
    });

    reads.count = 0;
    for (const item of items) {
      item.transported();
      item.executed();
      box.remove(item);
    }

    expect(lastAck).toBe(0);
    // One read per item for its own applied ordinals; none from the getter.
    expect(reads.count).toBeLessThanOrEqual(items.length);
    marker.executed();
    expect(box.ackOrdinal).toBe(items.length * OPS_PER_ITEM + OPS_PER_ITEM);
  });

  it("stops holding for a marker replaced under the same id", () => {
    const box = new Mailbox({ holdAckBelowMarkers: true });
    const first = countedItem(1, { count: 0 }, true);
    box.add(first);
    const replacement = countedItem(2, { count: 0 });
    Object.defineProperty(replacement, "id", { value: first.id });
    box.add(replacement);
    replacement.executed();
    expect(box.ackOrdinal).toBe(2 * OPS_PER_ITEM + OPS_PER_ITEM);
  });
});
