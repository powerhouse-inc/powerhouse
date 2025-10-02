import type { IDocumentDriveServer } from "document-drive";
import {
  BrowserStorage,
  EventQueueManager,
  InMemoryCache,
  ReactorBuilder,
  type DocumentDriveServerOptions,
} from "document-drive";
import type { DocumentModelModule } from "document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it } from "vitest";

function createBrowserDocumentDriveServer(
  documentModelModules: DocumentModelModule[],
  routerBasename: string,
  documentDriveServerOptions?: DocumentDriveServerOptions,
): IDocumentDriveServer {
  const builder = new ReactorBuilder(documentModelModules)
    .withStorage(new BrowserStorage(routerBasename))
    .withCache(new InMemoryCache())
    .withQueueManager(new EventQueueManager());

  if (documentDriveServerOptions) {
    builder.withOptions(documentDriveServerOptions);
  }

  return builder.build();
}

describe("reactor", () => {
  it("should create a reactor instance with minimal config", async () => {
    const documentModels = [
      documentModelDocumentModelModule as unknown as DocumentModelModule,
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
