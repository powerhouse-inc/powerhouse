import {
  ChannelScheme,
  EventBus,
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeAndStartAPI } from "../src/server.js";
import { boardModel, ledgerModel } from "./utils/code-first-models.js";

function recordingLogger(): ILogger {
  const logger: ILogger = {
    level: "error",
    verbose: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorHandler: vi.fn(),
    child: () => logger,
  };
  return logger;
}

let dispose: (() => Promise<void>) | undefined;

afterEach(async () => {
  await dispose?.();
  dispose = undefined;
});

async function start(hostValidation?: "log" | "refuse") {
  const logger = recordingLogger();
  const api = await initializeAndStartAPI(
    async (documentModels) => {
      const module = await new ReactorClientBuilder()
        .withReactorBuilder(
          new ReactorBuilder()
            .withEventBus(new EventBus())
            .withDocumentModelSources([
              ...documentModels,
              boardModel(),
              ledgerModel(),
            ])
            .withChannelScheme(ChannelScheme.SWITCHBOARD),
        )
        .buildModule();
      return { module };
    },
    {
      port: 0,
      dbPath: undefined,
      mcp: false,
      logger,
      enableDocumentModelSubgraphs: true,
      ...(hostValidation && { hostValidation }),
    },
    "switchboard",
  );
  dispose = api.dispose;
  const status = async (path: string) =>
    (
      await fetch(`http://localhost:${api.port}${path}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      })
    ).status;
  const refusals = vi
    .mocked(logger.error)
    .mock.calls.filter(([message]) => String(message).startsWith("Refusing"));
  return {
    board: await status("/graphql/board"),
    ledger: await status("/graphql/ledger"),
    refusals,
  };
}

describe("hostValidation through initializeAndStartAPI", () => {
  it("leaves a model with a finding out under refuse", async () => {
    expect(await start("refuse")).toEqual({
      board: 404,
      ledger: 200,
      refusals: [
        [
          "Refusing version 1 of document model @documentType from the GraphQL schema: @reasons",
          "test/board",
          "package scalar Bic has no registered binding; package scalar Iban has no registered binding",
        ],
      ],
    });
  }, 60_000);

  it("serves it by default", async () => {
    expect(await start()).toEqual({ board: 200, ledger: 200, refusals: [] });
  }, 60_000);
});
