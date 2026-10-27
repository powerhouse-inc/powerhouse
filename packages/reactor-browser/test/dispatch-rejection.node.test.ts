// A dispatched action the reducer rejects reaches the caller's onErrors with
// the reducer's error, against a real reactor in-process and over the worker RPC.
import type { IReactorClient } from "@powerhousedao/reactor";
import { MessageRouter, createPortTransport } from "@powerhousedao/reactor/rpc";
import {
  addFolder,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import type {
  Action,
  DocumentDispatch,
  PHDocument,
  RejectedAction,
} from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperationRejectedError } from "../src/errors.js";
import { createDispatch } from "../src/hooks/dispatch.js";
import { connectReactorClient } from "../src/rpc/connect-reactor.js";
import { ReactorHost } from "../src/rpc/reactor-host.js";
import {
  createInMemoryReactorClient,
  type InMemoryReactor,
} from "./rpc/reactor-fixture.js";

type Mode = {
  client: IReactorClient;
  dispose: () => Promise<void>;
};

async function inProcess(): Promise<Mode> {
  return createInMemoryReactorClient();
}

async function overWorkerRpc(): Promise<Mode> {
  const reactor: InMemoryReactor = await createInMemoryReactorClient();
  const host = new ReactorHost({
    build: () => Promise.resolve(reactor.client),
  });
  const channel = new MessageChannel();
  const disconnect = host.connect(createPortTransport(channel.port1));
  const router = new MessageRouter();
  router.attach(createPortTransport(channel.port2));
  const client = connectReactorClient(router, {
    version: { appBuildId: "b1", rpcProtocolVersion: 1, models: [] },
    construct: {},
  });
  return {
    client,
    dispose: async () => {
      disconnect();
      channel.port1.close();
      channel.port2.close();
      await reactor.dispose();
    },
  };
}

type Outcome = { errors?: Error[]; result?: PHDocument };

function dispatchTo(
  document: PHDocument,
  actions: Action | Action[],
): Promise<Outcome> {
  return new Promise((resolve) => {
    const outcome: Outcome = {};
    createDispatch(() => document)(
      actions,
      (errors) => {
        outcome.errors = errors;
      },
      (result) => {
        outcome.result = result;
        resolve(outcome);
      },
    );
  });
}

describe.each([
  ["in-process", inProcess],
  ["worker", overWorkerRpc],
])("a dispatch the reducer rejects (%s)", (_mode, start) => {
  let mode: Mode;
  let drive: PHDocument;

  beforeEach(async () => {
    mode = await start();
    vi.stubGlobal("window", { ph: { reactorClient: mode.client } });
    drive = await mode.client.createEmpty("powerhouse/document-drive");
    await mode.client.execute(drive.header.id, "main", [
      addFolder({ id: "f1", name: "A" }),
    ]);
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await mode.dispose();
  });

  it("reports the reducer's error to onErrors", async () => {
    const current = await mode.client.get(drive.header.id);
    const action = addFolder({ id: "f1", name: "B" });

    const { errors } = await dispatchTo(current, action);

    expect(errors).toHaveLength(1);
    const [error] = errors!;
    expect(OperationRejectedError.isError(error)).toBe(true);
    expect(error).toMatchObject({
      message: "Node with id f1 already exists!",
      kind: "reducer-error",
      documentId: drive.header.id,
      actionId: action.id,
      actionType: "ADD_FOLDER",
      scope: "global",
    });
  });

  it("reports only the rejected action of a batch, from a stale document", async () => {
    const applied = addFolder({ id: "f2", name: "B" });
    const rejected = addFolder({ id: "f1", name: "C" });

    const { errors, result } = await dispatchTo(drive, [applied, rejected]);

    expect(
      errors?.map((error) => (error as OperationRejectedError).actionId),
    ).toEqual([rejected.id]);
    const nodes = (result as DocumentDriveDocument).state.global.nodes;
    expect(nodes.map((node) => node.id).sort()).toEqual(["f1", "f2"]);
  });

  it("runs onErrors, then onSuccess with the document, on a rejection", async () => {
    const current = await mode.client.get(drive.header.id);
    const calls: string[] = [];

    const result = await new Promise<PHDocument>((resolve) => {
      createDispatch(() => current)(
        addFolder({ id: "f1", name: "B" }),
        () => calls.push("onErrors"),
        (document) => {
          calls.push("onSuccess");
          resolve(document);
        },
      );
    });

    expect(calls).toEqual(["onErrors", "onSuccess"]);
    expect(result.header.id).toBe(drive.header.id);
  });

  it("tells onSuccess which actions were rejected", async () => {
    const rejectedBy = (actions: Action[]) =>
      new Promise<RejectedAction[]>((resolve) => {
        createDispatch(() => drive)(actions, undefined, (_, outcome) =>
          resolve(outcome.rejected),
        );
      });
    const rejected = addFolder({ id: "f1", name: "F" });

    const rejection = await rejectedBy([
      addFolder({ id: "f4", name: "E" }),
      rejected,
    ]);
    // An editor's `dispatch: DocumentDispatch` gets the same outcome.
    const dispatch: DocumentDispatch = createDispatch<PHDocument, Action>(
      () => drive,
    );
    const success = await new Promise<RejectedAction[]>((resolve) => {
      dispatch(addFolder({ id: "f5", name: "G" }), undefined, (_, outcome) =>
        resolve(outcome.rejected),
      );
    });

    expect(rejection.map((error) => error.actionId)).toEqual([rejected.id]);
    expect(rejection[0]).toMatchObject({
      kind: "reducer-error",
      message: "Node with id f1 already exists!",
    });
    expect(success).toEqual([]);
  });

  it("does not call onErrors when every action applies", async () => {
    const current = await mode.client.get(drive.header.id);

    const { errors } = await dispatchTo(
      current,
      addFolder({ id: "f3", name: "D" }),
    );

    expect(errors).toBeUndefined();
  });
});
