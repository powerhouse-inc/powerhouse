import { describe, expect, it } from "vitest";
import * as reactor from "../../index.js";

describe("event type ids", () => {
  it("are unique across every exported *EventTypes family", () => {
    const families = Object.entries(reactor).filter(([name]) =>
      name.endsWith("EventTypes"),
    ) as Array<[string, Record<string, number>]>;
    expect(families.map(([name]) => name).sort()).toEqual(
      expect.arrayContaining([
        "JobExecutorEventTypes",
        "QueueEventTypes",
        "ReactorEventTypes",
        "SyncEventTypes",
      ]),
    );

    const owners = new Map<number, string>();
    const collisions: string[] = [];
    for (const [family, ids] of families) {
      for (const [key, id] of Object.entries(ids)) {
        const owner = owners.get(id);
        if (owner) collisions.push(`${id}: ${owner} / ${family}.${key}`);
        else owners.set(id, `${family}.${key}`);
      }
    }
    expect(collisions).toEqual([]);
  });
});
