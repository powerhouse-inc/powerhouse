// @vitest-environment happy-dom
import {
  ReactorBuilder,
  ReactorClientBuilder,
  type InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addDrive } from "../src/actions/drive.js";
import type { PHGlobal } from "../src/types/global.js";

let module: InProcessReactorClientModule;

beforeEach(async () => {
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder().withDocumentModelSources([
        driveDocumentModelModule as unknown as DocumentModelModule,
      ]),
    )
    .buildModule();
  window.ph = { reactorClient: module.client } as unknown as PHGlobal;
});

afterEach(() => {
  window.ph = {};
  module.reactor.kill();
});

describe("a drive Create Drive adds", () => {
  it("names the document as well as the drive", async () => {
    const created = await addDrive({
      id: "reports-drive",
      global: { name: "Reports", icon: null },
    });

    const stored = await module.client.get<DocumentDriveDocument>(
      created!.header.id,
    );
    expect(stored.header.name).toBe("Reports");
    expect(stored.state.global.name).toBe("Reports");
  });
});
