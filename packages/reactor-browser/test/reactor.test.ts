import { createBrowserDocumentDriveServer } from "@powerhousedao/reactor-browser";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";

describe("reactor", () => {
  it("should create a reactor instance with minimal config", async () => {
    const documentModels = [
      documentModelDocumentModelModule as DocumentModelModule,
    ];
    const routerBasename = "/test";

    const reactor = createBrowserDocumentDriveServer(
      documentModels,
      routerBasename,
    );

    expect(reactor).toBeDefined();
    await expect(reactor.initialize()).resolves.toBeNull();
    await expect(reactor.getDrives()).resolves.toEqual([]);
  });
});
