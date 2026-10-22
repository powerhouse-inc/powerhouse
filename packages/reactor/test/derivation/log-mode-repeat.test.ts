import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  addModule,
  deriveScope,
  documentModelStateReducer,
  redoTarget,
  undoTarget,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, describe, expect, it } from "vitest";
import type { ReactorClient } from "../../src/client/reactor-client.js";
import { ReactorClientBuilder } from "../../src/core/reactor-client-builder.js";
import type { InProcessReactorModule } from "../../src/core/types.js";
import {
  createBaseReducer3Document,
  createUndoV3ReactorBuilder,
} from "../factories.js";

const modules = (document: PHDocument): string[] =>
  (
    document.state as unknown as {
      global: { specifications: { modules: { id: string }[] }[] };
    }
  ).global.specifications[0].modules.map((m) => m.id);

describe('signatureVerification "log" admits an action id that repeats a RETRACT\'s', () => {
  let client: ReactorClient;
  let module: InProcessReactorModule;

  afterEach(() => {
    module.reactor.kill();
  });

  async function repeatRetractId() {
    const built = await new ReactorClientBuilder()
      .withReactorBuilder(
        createUndoV3ReactorBuilder().withExecutorConfig({
          signatureVerification: "log",
        }),
      )
      .buildModule();
    client = built.client;
    module = built.reactorModule as InProcessReactorModule;
    const document = createBaseReducer3Document({ signaturePolicy: "legacy" });
    await client.create(document);
    const id = document.header.id;
    await client.execute(id, "main", [addModule({ id: "a", name: "a" })]);
    await client.undo(id);
    const undone = (
      await module.operationStore.getSince(id, "global", "main", -1)
    ).results.at(-1)!;
    expect(undone.action.type).toBe("RETRACT");
    await client.execute(id, "main", [
      { ...addModule({ id: "x", name: "x" }), id: undone.action.id },
    ]);

    const rows = (
      await module.operationStore.getSince(id, "global", "main", -1)
    ).results;
    const state = documentModelDocumentModelModule.utils.createState();
    const cold = deriveScope(
      {
        header: {},
        state,
        initialState: state,
        operations: {},
        clipboard: [],
      } as unknown as PHDocument,
      rows,
      () => documentModelStateReducer as never,
      "global",
    );
    return { id, rows, cold };
  }

  it("serves undo targets equal to a cold derivation", async () => {
    const { id, rows, cold } = await repeatRetractId();

    expect(await module.reactor.resolveUndoRedo(id, "global")).toEqual({
      undoTarget: undoTarget(rows, cold.applied),
      redoTarget: redoTarget(rows, cold.applied),
    });
  });

  // The executor's single-row append still decides on findReferencing alone
  // (needsFullHistory, applyByRule), so it applies the repeat incrementally.
  it.fails("writes the state a cold derivation gives", async () => {
    const { id, cold } = await repeatRetractId();

    expect(modules(cold.document)).toEqual(["a", "x"]);
    expect(modules(await client.get(id))).toEqual(modules(cold.document));
  });
});
