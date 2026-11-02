import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import {
  driveDocumentModelModule,
  setDriveName,
} from "@powerhousedao/shared/document-drive";
import type { DriveInput } from "@powerhousedao/shared/document-drive";
import {
  withSignaturePolicy,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { deleteDocumentAction } from "@powerhousedao/reactor";
import { documentModelDocumentModelModule } from "document-model";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDefaultDrive, ensureDrive } from "../src/utils.mjs";

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

describe.each([
  ["without document decisions", false],
  ["with document decisions", true],
])("ensureDrive %s", (_name, documentDecisions) => {
  let module: InProcessReactorClientModule;
  const logger = { error: vi.fn() };
  const mail = { slug: "mail", global: { name: "Mail" } };

  const deleteDrive = async (id: string) => {
    await (
      await module.client.write.deleteDocument(id)
    ).readable;
  };

  beforeEach(async () => {
    logger.error.mockClear();
    module = await new ReactorClientBuilder()
      .withCreateSignaturePolicy("legacy")
      .withReactorBuilder(
        new ReactorBuilder()
          .withDocumentModelSources([
            driveDocumentModelModule as unknown as DocumentModelModule,
            documentModelDocumentModelModule as unknown as DocumentModelModule,
          ])
          .withExecutorConfig({ featureFlags: { documentDecisions } }),
      )
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  it("generates the id of a drive declared by its slug alone", async () => {
    await ensureDrive(module.client, mail, PORT, logger);

    const id = await module.client.resolveIdOrSlug("mail");
    expect(id).not.toBe("mail");
    const drive = await module.client.get(id);
    expect(drive.header.slug).toBe("mail");
    expect(drive.header.documentType).toBe("powerhouse/document-drive");
  });

  // A random id can't clash, so a second boot must find the drive by its slug.
  it("finds that drive again on the next boot instead of making a twin", async () => {
    await ensureDrive(module.client, mail, PORT, logger);
    const first = await module.client.resolveIdOrSlug("mail");

    await ensureDrive(module.client, mail, PORT, logger);

    const { results } = await module.client.find({
      type: "powerhouse/document-drive",
    });
    expect(results.map((drive) => drive.header.id)).toEqual([first]);
  });

  it("leaves a drive of another type under the slug as it is", async () => {
    await ensureDrive(module.client, mail, PORT, logger);
    const id = await module.client.resolveIdOrSlug("mail");

    await expect(
      ensureDrive(
        module.client,
        { ...mail, documentType: "powerhouse/reactor-drive" },
        PORT,
        logger,
      ),
    ).resolves.toBe(`http://localhost:${PORT}/d/${id}`);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("finds a drive whose id equals its slug, as older stores hold them", async () => {
    await ensureDrive(module.client, { ...mail, id: "mail" }, PORT, logger);

    await expect(ensureDrive(module.client, mail, PORT, logger)).resolves.toBe(
      `http://localhost:${PORT}/d/mail`,
    );
    await expect(module.client.resolveIdOrSlug("mail")).resolves.toBe("mail");
  });

  it("makes a new empty drive after the drive under the slug was deleted", async () => {
    await ensureDrive(module.client, mail, PORT, logger);
    const first = await module.client.resolveIdOrSlug("mail");
    await deleteDrive(first);

    await ensureDrive(module.client, mail, PORT, logger);

    const second = await module.client.resolveIdOrSlug("mail");
    expect(second).not.toBe(first);
    expect(logger.error).not.toHaveBeenCalled();
  });

  // Stores from before generated ids: the deleted drive's id is the slug.
  it("points the slug at the new drive when the deleted drive's id was that slug", async () => {
    await ensureDrive(module.client, { ...mail, id: "mail" }, PORT, logger);
    await deleteDrive("mail");

    await ensureDrive(module.client, mail, PORT, logger);

    const id = await module.client.resolveIdOrSlug("mail");
    expect(id).not.toBe("mail");
    await expect(module.client.get("mail")).resolves.toMatchObject({
      header: { id },
    });
    // Writes resolve through the identity table, reads through the view
    const renamed = await module.client.execute("mail", "main", [
      setDriveName({ name: "Renamed" }),
    ]);
    expect(renamed.header.id).toBe(id);
  });

  // A project-hashed drive declares an id, and that id outlives the drive.
  it.each([
    ["a different slug", "mail", "mail-1234abcd"],
    ["the same slug", "mail-1234abcd", "mail-1234abcd"],
  ])(
    "makes a new drive when a deleted drive holds the declared id, under %s",
    async (_case, slug, id) => {
      const declared = { ...mail, slug, id };
      await ensureDrive(module.client, declared, PORT, logger);
      await deleteDrive(id);

      await expect(
        ensureDrive(module.client, declared, PORT, logger),
      ).resolves.toBe(`http://localhost:${PORT}/d/${slug}`);

      const created = await module.client.resolveIdOrSlug(slug);
      expect(created).not.toBe(id);

      await ensureDrive(module.client, declared, PORT, logger);
      await expect(module.client.resolveIdOrSlug(slug)).resolves.toBe(created);
      expect(logger.error).not.toHaveBeenCalled();
    },
  );

  it("leaves a drive deleted when the delete kept its slug", async () => {
    await ensureDrive(module.client, mail, PORT, logger);
    const id = await module.client.resolveIdOrSlug("mail");
    await (
      await module.client.write.execute(id, "main", [
        deleteDocumentAction(id, { keepSlug: true }),
      ])
    ).readable;

    await expect(
      ensureDrive(module.client, mail, PORT, logger),
    ).resolves.toBeUndefined();

    const { results } = await module.client.find({
      type: "powerhouse/document-drive",
    });
    expect(results).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      `The default drive "mail" was not created: it was deleted, and its slug kept.`,
    );
  });

  it("refuses a drive with neither a slug nor an id", async () => {
    await expect(
      ensureDrive(module.client, { global: { name: "x" } }, PORT, logger),
    ).rejects.toThrow("A drive needs a slug");
  });
});
