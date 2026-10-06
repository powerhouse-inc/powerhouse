import {
  parseReactorConnectionConfig,
  reducer,
  utils,
  type ConnectionAction,
  type ConnectionDocument,
} from "document-models/connection/v1";
import { describe, expect, it } from "vitest";
import { reactorConnections } from "./reactor-access.js";
import { newReactorConnectionActions } from "./reactor-connection-create.js";

function created(requireReactor: "read" | "write"): ConnectionDocument {
  let document = utils.createDocument();
  for (const action of newReactorConnectionActions(
    "Reactor access",
    requireReactor,
  )) {
    document = reducer(document, action as ConnectionAction);
  }
  return document;
}

describe("newReactorConnectionActions", () => {
  it("makes a ready REACTOR connection the picker lists", () => {
    const document = created("write");
    const errors = document.operations.global.filter(
      (operation) => operation.error,
    );
    expect(errors).toEqual([]);
    const state = document.state.global;
    expect(state.name).toBe("Reactor access");
    expect(state.status).toBe("OK");
    expect(state.config).toEqual({ endpoint: "local" });
    expect(
      reactorConnections([{ ...state, id: document.header.id }]),
    ).toHaveLength(1);
  });

  it("limits a connection made for a reading block to reads", () => {
    const parsed = parseReactorConnectionConfig(
      created("read").state.global.config,
    );
    expect(parsed).toEqual({
      ok: true,
      config: { endpoint: "local", access: "read" },
    });
  });
});
