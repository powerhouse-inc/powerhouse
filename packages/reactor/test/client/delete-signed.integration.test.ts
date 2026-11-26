import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import {
  actions,
  derivedActionId,
  type Action,
  type Operation,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteDocumentAction } from "../../src/actions/index.js";
import type {
  DeleteAuthorizer,
  IReactorClient,
} from "../../src/client/types.js";
import { completesSignedDeletes } from "../../src/client/types.js";
import type { ReactorWriteClient } from "../../src/client/write-client.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { IReactor } from "../../src/core/types.js";
import { InvalidSignedDeleteError } from "../../src/shared/errors.js";
import { PropagationMode } from "../../src/shared/types.js";
import { createDocModelDocument } from "../factories.js";
import { TestP256Signer } from "../utils/p256-signer.js";

// A delete the caller signed: one DELETE_DOCUMENT of the caller's; the
// relationships into the document, its document drive's node and the
// cascaded deletes are the host's own work, under ids derived from it.

const CALLER = { address: "0xcaller", networkId: "eip155", chainId: 1 };

describe("ReactorWriteClient.deleteSigned", () => {
  let client: IReactorClient;
  let write: ReactorWriteClient;
  let reactor: IReactor;
  let host: TestP256Signer;
  let caller: TestP256Signer;

  beforeEach(async () => {
    host = await TestP256Signer.create();
    caller = await TestP256Signer.create();
    const module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule,
          driveDocumentModelModule,
        ]),
      )
      .withSigner(host.asISigner())
      .buildModule();
    client = module.client;
    write = module.client.write as ReactorWriteClient;
    reactor = module.reactor;
  });

  afterEach(() => {
    reactor.kill();
  });

  /** The caller's signed DELETE_DOCUMENT of `documentId`. */
  async function signedDelete(documentId: string): Promise<Action> {
    const action = deleteDocumentAction(documentId);
    const tuple = await caller.v2Tuple(
      action,
      { documentId, branch: "main" },
      CALLER,
    );
    return {
      ...action,
      context: {
        signer: {
          user: CALLER,
          app: { name: "test", key: caller.did },
          signatures: [tuple],
        },
      },
    };
  }

  async function operationsOf(documentId: string): Promise<Operation[]> {
    const byScope = await reactor.getOperations(documentId);
    return Object.values(byScope).flatMap((page) => page.results);
  }

  const keyOf = (operation: Operation) =>
    operation.action.context?.signer?.app.key;

  it("is offered by the in-process write half", () => {
    expect(completesSignedDeletes(write)).toBe(true);
    expect(completesSignedDeletes({})).toBe(false);
  });

  it("deletes with the caller's own action and unfiles the document as the host's work", async () => {
    const drive = driveDocumentModelModule.utils.createDocument();
    await client.create(drive);
    const file = documentModelDocumentModelModule.utils.createDocument();
    file.header.name = "Filed";
    await client.drives.addFile(drive.header.id, file);
    const linker = createDocModelDocument({ id: "linker" });
    await client.create(linker);
    await client.addRelationship("linker", file.header.id, "ref");

    const action = await signedDelete(file.header.id);
    await (
      await write.deleteSigned({ action })
    ).readable;

    await expect(client.get(file.header.id)).rejects.toThrow();
    const deleted = (await operationsOf(file.header.id)).find(
      (op) => op.action.type === "DELETE_DOCUMENT",
    );
    expect(deleted?.action.id).toBe(action.id);
    expect(keyOf(deleted!)).toBe(caller.did);

    const driveAfter = await client.get(drive.header.id);
    expect(
      (driveAfter.state as unknown as { global: { nodes: { id: string }[] } })
        .global.nodes,
    ).toEqual([]);
    const driveOps = await operationsOf(drive.header.id);
    const node = driveOps.find((op) => op.action.type === "DELETE_NODE")!;
    expect(node.action.id).toBe(
      derivedActionId(action.id, `node:${drive.header.id}`),
    );
    expect(keyOf(node)).toBe(host.did);
    const unlinked = driveOps.find(
      (op) => op.action.type === "REMOVE_RELATIONSHIP",
    )!;
    expect(unlinked.action.id).toBe(
      derivedActionId(
        action.id,
        `remove:${drive.header.id}:${file.header.id}:child`,
      ),
    );
    expect(keyOf(unlinked)).toBe(host.did);

    const linkerOps = await operationsOf("linker");
    const removed = linkerOps.find(
      (op) => op.action.type === "REMOVE_RELATIONSHIP",
    )!;
    expect(removed.action.id).toBe(
      derivedActionId(action.id, `remove:linker:${file.header.id}:ref`),
    );
    expect(keyOf(removed)).toBe(host.did);
  });

  it("cascades to the orphaned children, asking the signer's rights for each first", async () => {
    await client.create(createDocModelDocument({ id: "root" }));
    await client.create(createDocModelDocument({ id: "child" }), "root");
    await client.create(createDocModelDocument({ id: "grandchild" }), "child");
    const mayDelete = vi.fn<DeleteAuthorizer>(() => Promise.resolve());

    const action = await signedDelete("root");
    await (
      await write.deleteSigned({
        action,
        propagate: PropagationMode.Cascade,
        mayDelete,
      })
    ).readable;

    for (const id of ["root", "child", "grandchild"]) {
      await expect(client.get(id)).rejects.toThrow();
    }
    expect(mayDelete.mock.calls.map(([request]) => request)).toEqual([
      {
        documentId: "grandchild",
        rootId: "root",
        signer: action.context!.signer,
      },
      { documentId: "child", rootId: "root", signer: action.context!.signer },
      { documentId: "root", rootId: "root", signer: action.context!.signer },
    ]);
    const childDelete = (await operationsOf("child")).find(
      (op) => op.action.type === "DELETE_DOCUMENT",
    )!;
    expect(childDelete.action.id).toBe(
      derivedActionId(action.id, "delete:child"),
    );
    expect(keyOf(childDelete)).toBe(host.did);
  });

  it("writes nothing when the signer may not delete a cascaded child", async () => {
    await client.create(createDocModelDocument({ id: "root" }));
    await client.create(createDocModelDocument({ id: "child" }), "root");

    await expect(
      write.deleteSigned({
        action: await signedDelete("root"),
        propagate: PropagationMode.Cascade,
        mayDelete: ({ documentId }) =>
          documentId === "child"
            ? Promise.reject(new Error("not yours"))
            : Promise.resolve(),
      }),
    ).rejects.toThrow("not yours");
    await expect(client.get("root")).resolves.toBeDefined();
    await expect(client.get("child")).resolves.toBeDefined();
  });

  it("refuses before writing anything an action that is no signed DELETE_DOCUMENT of a document held by its id", async () => {
    await client.create(
      createDocModelDocument({ id: "kept", slug: "kept-slug" }),
    );
    const unsigned = deleteDocumentAction("kept");
    const rename = actions.setName("other");
    const forged = await signedDelete("kept");
    const tampered: Action = {
      ...forged,
      input: { documentId: "kept", keepSlug: true },
    };
    const bySlug = await signedDelete("kept-slug");

    for (const action of [unsigned, rename, tampered, bySlug]) {
      await expect(write.deleteSigned({ action })).rejects.toThrow(
        InvalidSignedDeleteError,
      );
    }
    await expect(
      write.deleteSigned({ action: await signedDelete("nobody") }),
    ).rejects.toThrow(InvalidSignedDeleteError);
    await expect(client.get("kept")).resolves.toBeDefined();
  });

  it("writes nothing new when the same signed delete is completed again", async () => {
    await client.create(createDocModelDocument({ id: "parent" }));
    await client.create(createDocModelDocument({ id: "only-child" }), "parent");
    const action = await signedDelete("only-child");
    await (
      await write.deleteSigned({ action })
    ).readable;
    const before = (await operationsOf("parent")).length;

    await write
      .deleteSigned({ action })
      .then((handle) => handle.readable)
      .catch(() => undefined);

    expect((await operationsOf("parent")).length).toBe(before);
  });
});
