import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DriveInput } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDefaultDrive } from "../src/utils.mjs";

const PORT = 4001;

const workflows = (id: string): DriveInput =>
  ({
    id,
    slug: "workflows",
    global: { name: "Workflows" },
    local: {
      availableOffline: true,
      listeners: [],
      sharingType: "public",
      triggers: [],
    },
  }) as DriveInput;

describe("addDefaultDrive with a slug another document holds", () => {
  let module: InProcessReactorClientModule;
  const logger = { error: vi.fn() };

  beforeEach(async () => {
    logger.error.mockClear();
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
          documentModelDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  const isCreated = (id: string) =>
    module.client.get(id).then(
      () => true,
      () => false,
    );

  it("creates the drive when the slug is free", async () => {
    await expect(
      addDefaultDrive(module.client, workflows("workflows-a"), PORT, logger),
    ).resolves.toBe(`http://localhost:${PORT}/d/workflows-a`);
    await expect(module.client.resolveIdOrSlug("workflows")).resolves.toBe(
      "workflows-a",
    );
  });

  // A project moved to another folder hashes its drive ids anew.
  it("serves the drive that holds the slug instead of creating a twin", async () => {
    await addDefaultDrive(
      module.client,
      workflows("workflows-a"),
      PORT,
      logger,
    );
    await expect(
      addDefaultDrive(module.client, workflows("workflows-b"), PORT, logger),
    ).resolves.toBe(`http://localhost:${PORT}/d/workflows-a`);
    expect(await isCreated("workflows-b")).toBe(false);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("logs an error and creates nothing when another kind of document holds it", async () => {
    const other = withSignaturePolicy(
      documentModelDocumentModelModule.utils.createDocument(),
      "legacy",
    );
    other.header.slug = "workflows";
    await module.client.create(other);

    await expect(
      addDefaultDrive(module.client, workflows("workflows-c"), PORT, logger),
    ).resolves.toBeUndefined();
    expect(await isCreated("workflows-c")).toBe(false);
    expect(logger.error).toHaveBeenCalledWith(
      `The default drive "workflows" was not created: the slug belongs to powerhouse/document-model document ${other.header.id}.`,
    );
  });
});
