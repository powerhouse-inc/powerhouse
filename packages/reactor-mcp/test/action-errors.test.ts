import type {
  IReactorClient,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type {
  DocumentModelDocumentModelModule,
  DocumentModelPHState,
  StateReducer,
} from "@powerhousedao/shared/document-model";
import {
  createReducer,
  documentModelStateReducer,
} from "@powerhousedao/shared/document-model";
import {
  documentModelCreateDocument,
  documentModelDocumentModelModule,
} from "document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addActionsTool, toMcpTool } from "../src/index.js";
import { createP256Signer } from "./utils/p256-signer.js";

// Code generated before the model set a code used the class name.
let stale = false;

// As codegen generates them: no `name`, the model's code as `errorCode`.
class DescriptionTakenError extends Error {
  errorCode = stale ? "DescriptionTakenError" : "DESCRIPTION_TAKEN";
  constructor(message = "DescriptionTakenError") {
    super(message);
  }
}

const stateReducer: StateReducer<DocumentModelPHState> = (
  state,
  action,
  dispatch,
) => {
  if (action.type === "SET_MODEL_DESCRIPTION") {
    const { description } = action.input as { description: string };
    throw description === "default"
      ? new DescriptionTakenError()
      : new DescriptionTakenError(`"${description}" is taken`);
  }
  return documentModelStateReducer(state, action, dispatch);
};

/** The document model's own module, declaring the error its reducer throws. */
function moduleWithError(): DocumentModelDocumentModelModule {
  const documentModel = structuredClone(
    documentModelDocumentModelModule.documentModel,
  );
  const operation = documentModel.global.specifications
    .at(-1)!
    .modules.flatMap((module) => module.operations)
    .find((op) => op.name === "SET_MODEL_DESCRIPTION")!;
  operation.errors = [
    {
      id: "description-taken",
      name: "DescriptionTakenError",
      code: "DESCRIPTION_TAKEN",
      description: "Another model has this description",
      template: "",
    },
  ];
  return {
    ...documentModelDocumentModelModule,
    documentModel,
    reducer: createReducer(stateReducer),
  };
}

/** As a client whose job info has no result field, e.g. a remote one. */
function withoutJobResults(client: IReactorClient): IReactorClient {
  const write = new Proxy(client.write, {
    get(target, key, receiver) {
      if (key !== "execute") return Reflect.get(target, key, receiver);
      return async (...args: Parameters<typeof target.execute>) => {
        const handle = await target.execute(...args);
        const readable = handle.readable.then((receipt) => ({
          ...receipt,
          job: { ...receipt.job, result: undefined },
        }));
        return { ...handle, readable };
      };
    },
  });
  return new Proxy(client, {
    get: (target, key, receiver) =>
      key === "write" ? write : Reflect.get(target, key, receiver),
  });
}

describe("addActions results for a rejected action", () => {
  let module: InProcessReactorClientModule;

  beforeEach(async () => {
    stale = false;
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([moduleWithError()]),
      )
      .withSigner(await createP256Signer())
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  async function describeAs(client: IReactorClient, description: string) {
    const document = documentModelCreateDocument();
    await (
      await module.client.write.create(document)
    ).readable;
    const result = await toMcpTool(addActionsTool, { client }).callback({
      documentId: document.header.id,
      actions: [
        {
          type: "SET_MODEL_DESCRIPTION",
          input: { description },
          scope: "global",
        },
      ],
    });
    return (
      result.structuredContent as {
        results: { error?: Record<string, string> }[];
      }
    ).results[0].error;
  }

  it("names the model's error and its code", async () => {
    expect(await describeAs(module.client, "Books")).toStrictEqual({
      kind: "reducer-error",
      message: '"Books" is taken',
      name: "DescriptionTakenError",
      code: "DESCRIPTION_TAKEN",
    });
  });

  it("gives the model's code for an error class generated before the model had one", async () => {
    stale = true;

    expect(await describeAs(module.client, "Books")).toMatchObject({
      name: "DescriptionTakenError",
      code: "DESCRIPTION_TAKEN",
    });
  });

  it("matches a stored operation's default message to the model's error", async () => {
    const client = withoutJobResults(module.client);

    expect(await describeAs(client, "default")).toStrictEqual({
      kind: "reducer-error",
      message: "DescriptionTakenError",
      name: "DescriptionTakenError",
      code: "DESCRIPTION_TAKEN",
    });
  });
});
