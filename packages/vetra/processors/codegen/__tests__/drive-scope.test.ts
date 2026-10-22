// @vitest-environment node
import type {
  IProcessorHostModule,
  IReactorClient,
} from "@powerhousedao/reactor-browser";
import {
  ReactorBuilder,
  ReactorClientBuilder,
} from "@powerhousedao/reactor-browser";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  generateId,
  setAuthorName,
  setAuthorWebsite,
  setInitialState,
  setModelDescription,
  setModelExtension,
  setModelId,
  setModelName,
  setStateSchema,
  withSignaturePolicy,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import type { MockInstance } from "vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { codegenFactoryBuilder } from "../factory.js";
import { logger } from "../logger.js";

// setupTests mocks the package for the editors; this needs a real reactor.
vi.unmock("@powerhousedao/reactor-browser");

type ClientModule = Awaited<ReturnType<ReactorClientBuilder["buildModule"]>>;

const SKIPPED = "Skipped code generation for";
// The manager debounces generation by a second per document.
const DEBOUNCE_SETTLED_MS = 2_500;

async function createDrive(
  client: IReactorClient,
  slug: string,
): Promise<string> {
  const drive = withSignaturePolicy(
    driveDocumentModelModule.utils.createDocument(),
    "legacy",
    { id: generateId() },
  );
  drive.header.slug = slug;
  drive.header.name = slug;
  const created = await client.create(drive);
  return created.header.id;
}

// No modules, so every intermediate and the final state fail validation.
function specSheetActions() {
  return [
    setModelName({ name: "Spec" }),
    setModelId({ id: "stockroom/spec-sheet" }),
    setModelExtension({ extension: "spec" }),
    setModelDescription({ description: "A product spec sheet" }),
    setAuthorName({ authorName: "Stockroom" }),
    setAuthorWebsite({ authorWebsite: "https://example.com" }),
    setStateSchema({
      scope: "global",
      schema: "type SpecSheetState { title: String }",
    }),
    setInitialState({ scope: "global", initialValue: '{"title":null}' }),
    setModelName({ name: "Spec sheet" }),
  ];
}

type InfoSpy = MockInstance<typeof logger.info>;

function skippedMessages(info: InfoSpy): string[] {
  return info.mock.calls
    .map((args) => String(args[0]))
    .filter((message) => message.includes(SKIPPED));
}

describe("codegen processor drive scope", () => {
  let module: ClientModule | undefined;
  let info: InfoSpy;

  beforeEach(() => {
    info = vi.spyOn(logger, "info");
  });

  afterEach(async () => {
    info.mockRestore();
    await module?.reactor.kill().completed;
    module = undefined;
  });

  async function setup(): Promise<{ client: IReactorClient }> {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule,
          documentModelDocumentModelModule,
        ] as never),
      )
      .withCreateSignaturePolicy("legacy")
      .buildModule();
    const client = module.client;
    const factory = await codegenFactoryBuilder({
      config: new Map<string, unknown>(),
      client,
    } as unknown as IProcessorHostModule);
    await module.reactorModule!.processorManager.registerFactory(
      "vetra",
      factory,
    );
    return { client };
  }

  async function addSpecSheet(
    client: IReactorClient,
    driveId: string,
  ): Promise<string> {
    const document = await client.createEmpty<PHDocument>(
      "powerhouse/document-model",
      { parentIdentifier: driveId },
    );
    await client.execute(document.header.id, "main", specSheetActions());
    return document.header.id;
  }

  it("ignores a document model in a drive that is not the Vetra drive", async () => {
    const { client } = await setup();
    const vetraDriveId = await createDrive(client, "vetra-scope");
    const otherDriveId = await createDrive(client, "stockroom-north");
    await vi.waitFor(() =>
      expect(
        module!.reactorModule!.processorManager.getAll().map((t) => t.driveId),
      ).toContain(vetraDriveId),
    );

    await addSpecSheet(client, otherDriveId);
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLED_MS));

    expect(skippedMessages(info)).toEqual([]);
  });

  it("logs a skipped batch once, for its final state", async () => {
    const { client } = await setup();
    const vetraDriveId = await createDrive(client, "vetra-scope");
    await vi.waitFor(() =>
      expect(
        module!.reactorModule!.processorManager.getAll().map((t) => t.driveId),
      ).toContain(vetraDriveId),
    );

    await addSpecSheet(client, vetraDriveId);

    await vi.waitFor(() => expect(skippedMessages(info)).toHaveLength(1), {
      timeout: 10_000,
    });
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_SETTLED_MS));
    const messages = skippedMessages(info);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("'Spec sheet'");
  });
});
