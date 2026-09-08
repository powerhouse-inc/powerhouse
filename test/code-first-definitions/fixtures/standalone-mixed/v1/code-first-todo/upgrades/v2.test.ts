import { describe, expect, it } from "vitest";
import type { Action } from "document-model";
import { CodeFirstTodoV1 } from "../index.js";
import { upgradeToV2 } from "./v2.js";

describe("CodeFirstTodo upgrade to v2", () => {
  it("backfills a list name", () => {
    const document = CodeFirstTodoV1.utils.createDocument();
    const action = {
      id: "upgrade-to-v2",
      type: "UPGRADE_DOCUMENT",
      timestampUtcMs: "1970-01-01T00:00:00.000Z",
      input: {},
      scope: "document",
    } satisfies Action;
    upgradeToV2.upgradeReducer(document, action);
    const upgradedState = document.state
      .global as typeof document.state.global & {
      listName: string;
    };

    expect(upgradedState).toMatchObject({
      listName: "Migrated code-first todos",
      todos: [],
    });
  });
});
