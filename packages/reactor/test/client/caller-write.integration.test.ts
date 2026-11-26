import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { signFor, testSigner } from "@powerhousedao/shared/testing";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deleteDocumentAction } from "../../src/actions/index.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorClientModule } from "../../src/core/types.js";
import {
  CallerSigner,
  UnsignedWriteError,
} from "../../src/signer/caller-signer.js";

// A host's caller writes sign nothing for the caller: an action its caller did
// not sign is refused before anything is submitted, unless the request
// delegated a signer.

const setModelName = (name: string) =>
  documentModelDocumentModelModule.actions.setModelName({ name });

describe("callerWrite", () => {
  let module: InProcessReactorClientModule;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          documentModelDocumentModelModule,
          driveDocumentModelModule,
        ]),
      )
      .withSigner(await testSigner("0xhost", { app: "switchboard" }))
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  async function created(): Promise<string> {
    const document = await module.read.newDocument("powerhouse/document-model");
    const handle = await module.write.create(document);
    await handle.readable;
    return document.header.id;
  }

  async function operationsOf(documentId: string): Promise<Operation[]> {
    const byScope = await module.reactor.getOperations(documentId);
    return Object.values(byScope).flatMap((page) => page.results);
  }

  const refused = (kind: string, actionType: string) => (error: unknown) =>
    UnsignedWriteError.isError(error) &&
    error.kind === kind &&
    error.actionType === actionType;

  it("refuses an action it is asked to sign, and submits nothing", async () => {
    const id = await created();
    const before = (await operationsOf(id)).length;
    await expect(
      module.callerWrite.execute(id, "main", [setModelName("x")]),
    ).rejects.toSatisfy(refused("unsigned", "SET_MODEL_NAME"));
    expect(await operationsOf(id)).toHaveLength(before);
  });

  it("refuses the writes the host would build", async () => {
    const id = await created();
    await expect(module.callerWrite.rename(id, "x")).rejects.toSatisfy(
      refused("unsigned", "SET_NAME"),
    );
    const document = await module.read.newDocument("powerhouse/document-model");
    await expect(module.callerWrite.create(document)).rejects.toSatisfy(
      refused("unsigned", "CREATE_DOCUMENT"),
    );
    await expect(module.callerWrite.deleteDocument(id)).rejects.toSatisfy(
      refused("unsigned", "DELETE_DOCUMENT"),
    );
  });

  it("applies an action its caller signed, as the caller", async () => {
    const id = await created();
    const caller = await testSigner("0xcaller");
    const signed = await signFor(caller, setModelName("x"), id);
    const handle = await module.callerWrite.execute(id, "main", [signed]);
    await handle.readable;
    const last = (await operationsOf(id)).at(-1)!;
    expect(last.action.context?.signer?.user?.address).toBe("0xcaller");
  });

  it("refuses an action signed by a key that names no user", async () => {
    const id = await created();
    const keyOnly = await testSigner("");
    const signed = await signFor(keyOnly, setModelName("x"), id);
    await expect(
      module.callerWrite.execute(id, "main", [signed]),
    ).rejects.toSatisfy(refused("no-identity", "SET_MODEL_NAME"));
  });

  it("signs with the signer the request delegated", async () => {
    const id = await created();
    const session = await testSigner("0xsession", { app: "host session" });
    const write = module.client.callerWrite(
      new CallerSigner({ resolve: () => session }),
    );
    const handle = await write.rename(id, "y");
    await handle.readable;
    const last = (await operationsOf(id)).at(-1)!;
    expect(last.action.context?.signer?.user?.address).toBe("0xsession");
    expect(last.action.context?.signer?.app?.name).toBe("host session");
  });

  it("tells its door of each refusal", async () => {
    const id = await created();
    const told: string[] = [];
    const write = module.client.callerWrite(
      new CallerSigner({ onRefused: (error) => told.push(error.actionType) }),
    );
    await expect(write.rename(id, "z")).rejects.toThrow();
    expect(told).toEqual(["SET_NAME"]);
  });

  it("completes a signed delete as the host, with the root signed by its caller", async () => {
    const id = await created();
    const caller = await testSigner("0xcaller");
    const signed = await signFor(caller, deleteDocumentAction(id), id);
    const handle = await module.callerWrite.deleteSigned({ action: signed });
    await handle.readable;
    const last = (await operationsOf(id)).at(-1)!;
    expect(last.action.type).toBe("DELETE_DOCUMENT");
    expect(last.action.context?.signer?.user?.address).toBe("0xcaller");
  });

  it("refuses a signed delete whose key names no user", async () => {
    const id = await created();
    const keyOnly = await testSigner("");
    const signed = await signFor(keyOnly, deleteDocumentAction(id), id);
    await expect(
      module.callerWrite.deleteSigned({ action: signed }),
    ).rejects.toSatisfy(refused("no-identity", "DELETE_DOCUMENT"));
  });
});
