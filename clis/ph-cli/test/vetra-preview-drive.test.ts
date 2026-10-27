import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startVetraPreviewDrive } from "../src/services/vetra.js";
import { generateProjectDriveId } from "../src/utils.js";

const PORT = 4001;

describe("the Vetra Preview drive's app", () => {
  let module: InProcessReactorClientModule;
  const previewDriveId = generateProjectDriveId("preview");
  const appOf = async () =>
    (await module.client.read.get(previewDriveId)).header.meta?.preferredEditor;

  beforeEach(async () => {
    module = await new ReactorClientBuilder()
      .withReactorBuilder(
        new ReactorBuilder().withDocumentModelSources([
          driveDocumentModelModule as unknown as DocumentModelModule,
        ]),
      )
      .buildModule();
  });

  afterEach(() => {
    module.reactor.kill();
  });

  it("is the configured app on a new drive", async () => {
    await expect(
      startVetraPreviewDrive(module.client, PORT, false, "my-drive-app"),
    ).resolves.toBe(`http://localhost:${PORT}/d/${previewDriveId}`);

    expect(await appOf()).toBe("my-drive-app");
  });

  it("is set on a drive an earlier run created", async () => {
    await startVetraPreviewDrive(module.client, PORT);
    expect(await appOf()).toBeUndefined();

    await startVetraPreviewDrive(module.client, PORT, false, "my-drive-app");
    expect(await appOf()).toBe("my-drive-app");

    await startVetraPreviewDrive(module.client, PORT, false, "other-app");
    expect(await appOf()).toBe("other-app");
  });

  it("stays as it is when none is configured", async () => {
    await startVetraPreviewDrive(module.client, PORT, false, "my-drive-app");
    await startVetraPreviewDrive(module.client, PORT);

    expect(await appOf()).toBe("my-drive-app");
  });
});
