// @vitest-environment happy-dom

import { PGlite } from "@electric-sql/pglite";
import type {
  Database,
  InProcessReactorClientModule,
} from "@powerhousedao/reactor";
import { ReactorBuilder, ReactorClientBuilder } from "@powerhousedao/reactor";
import type { PHStore } from "@powerhousedao/reactor-browser";
import {
  addPHEventHandlers,
  bindPHStoreToWindow,
  createPHStore,
  PHStoreProvider,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  FileNode,
} from "@powerhousedao/shared/document-drive";
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import {
  MemoryKeyStorage,
  RenownCryptoBuilder,
  RenownCryptoSigner,
} from "@renown/sdk";
import { fireEvent, render, screen } from "@testing-library/react";
import { createZip, documentModelDocumentModelModule } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { i18n } from "../../../i18n/index.js";
import {
  addPendingImportFiles,
  clearPendingImportFiles,
  getPendingImportFiles,
} from "../../../utils/launch-queue.js";
import { OpenFileDocumentsModal } from "./OpenFileDocumentsModal.js";

const t = (key: string, values?: Record<string, string>) => i18n.t(key, values);

let module: InProcessReactorClientModule;
let store: PHStore;

beforeAll(async () => {
  const db = new Kysely<Database>({
    dialect: new PGliteDialect(new PGlite()),
  });
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  module = await new ReactorClientBuilder()
    .withReactorBuilder(
      new ReactorBuilder()
        .withDocumentModelSources([
          driveDocumentModelModule,
          documentModelDocumentModelModule,
        ])
        .withKysely(db),
    )
    .withSigner(new RenownCryptoSigner(crypto, "connect-test"))
    .buildModule();
  store = createPHStore();
  bindPHStoreToWindow(store);
  addPHEventHandlers();
}, 60_000);

afterAll(() => {
  module.reactor.kill();
});

async function createDrive(name: string) {
  const drive = driveDocumentModelModule.utils.createDocument();
  drive.header.name = name;
  drive.state.global.name = name;
  return module.client.create<DocumentDriveDocument>(drive);
}

function createModel(name: string) {
  const document = documentModelDocumentModelModule.utils.createDocument();
  document.header.name = name;
  return document;
}

// Stored first, so the export is what a user's file actually contains.
function storedModel(name: string) {
  return module.client.create(createModel(name));
}

// Every file needs its own identity: parse results are cached per file.
let fileCounter = 0;
async function phdFile(fileName: string, document: PHDocument) {
  const data = await createZip(document);
  return new File([new Uint8Array(data)], fileName, {
    lastModified: ++fileCounter,
  });
}

function corruptFile(fileName: string) {
  return new File(["not a zip"], fileName, { lastModified: ++fileCounter });
}

async function refreshDrives(...drives: DocumentDriveDocument[]) {
  store.drives = await Promise.all(
    drives.map((drive) =>
      module.client.get<DocumentDriveDocument>(drive.header.id),
    ),
  );
}

async function fileNamesIn(drive: DocumentDriveDocument) {
  const current = await module.client.get<DocumentDriveDocument>(
    drive.header.id,
  );
  return current.state.global.nodes
    .filter((node): node is FileNode => node.kind === "file")
    .map((node) => node.name)
    .sort();
}

function renderModal() {
  return render(
    <PHStoreProvider store={store}>
      <OpenFileDocumentsModal />
    </PHStoreProvider>,
  );
}

const importButton = () =>
  screen.queryByText(t("modals.openFileDocuments.import")) ??
  screen.getByText(t("modals.openFileDocuments.renameAndImport"));

async function waitForReady() {
  await vi.waitFor(() => {
    expect(
      screen.queryByText(t("modals.openFileDocuments.checking")),
    ).toBeNull();
  });
}

describe("OpenFileDocumentsModal", () => {
  let driveA: DocumentDriveDocument;

  beforeEach(async () => {
    clearPendingImportFiles();
    driveA = await createDrive("Drive A");
    Object.assign(store, {
      reactorClient: module.client,
      fullReactorClient: module.client,
      drives: [driveA],
      selectedDriveId: undefined,
      allowedDocumentTypes: undefined,
      allowList: undefined,
      modal: { type: "openFileDocuments" },
    });
  });

  it("disables Import while files are being checked, then enables it", async () => {
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    expect(
      screen.getByText(t("modals.openFileDocuments.checking")),
    ).toBeDefined();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    await waitForReady();
    expect((importButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("imports into the selected drive, closes, and selects the drive", async () => {
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    await waitForReady();

    fireEvent.click(importButton());
    expect(getPendingImportFiles()).toHaveLength(0);
    expect(store.modal).toBeUndefined();
    expect(store.selectedDriveId).toBe(driveA.header.id);
    await vi.waitFor(async () => {
      expect(await fileNamesIn(driveA)).toEqual(["doc"]);
    });
  });

  it("renames name duplicates and labels the button accordingly", async () => {
    await module.client.createDocumentInDrive(
      driveA.header.id,
      createModel("doc"),
    );
    await refreshDrives(driveA);
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    await waitForReady();

    expect(
      screen.getByText(
        t("modals.openFileDocuments.duplicateHint", { name: "doc (copy) 1" }),
      ),
    ).toBeDefined();
    fireEvent.click(
      screen.getByText(t("modals.openFileDocuments.renameAndImport")),
    );
    await vi.waitFor(async () => {
      expect(await fileNamesIn(driveA)).toEqual(["doc", "doc (copy) 1"]);
    });
  });

  it("announces an id duplicate as a copy without renaming", async () => {
    const existing = await module.client.createDocumentInDrive(
      driveA.header.id,
      createModel("other"),
    );
    await refreshDrives(driveA);
    addPendingImportFiles([await phdFile("doc.phd", existing)]);
    renderModal();
    await waitForReady();

    expect(
      screen.getByText(t("modals.openFileDocuments.duplicateCopyHint")),
    ).toBeDefined();
    expect(
      screen.getByText(t("modals.openFileDocuments.import")),
    ).toBeDefined();
  });

  it("labels a batch-internal name clash as a rename, not a drive duplicate", async () => {
    addPendingImportFiles([
      await phdFile("doc.phd", await storedModel("doc")),
      await phdFile("doc.phdm", await storedModel("doc")),
    ]);
    renderModal();
    await waitForReady();

    expect(
      screen.getByText(
        t("modals.openFileDocuments.renamedHint", { name: "doc (copy) 1" }),
      ),
    ).toBeDefined();
    expect(
      screen.queryByText(
        t("modals.openFileDocuments.duplicateHint", { name: "doc (copy) 1" }),
      ),
    ).toBeNull();

    fireEvent.click(importButton());
    await vi.waitFor(async () => {
      expect(await fileNamesIn(driveA)).toEqual(["doc", "doc (copy) 1"]);
    });
  });

  it("excludes invalid files from the import and flags them inline", async () => {
    addPendingImportFiles([
      corruptFile("bad.phd"),
      await phdFile("good.phd", await storedModel("good")),
    ]);
    renderModal();
    await waitForReady();

    expect(
      screen.getByText(t("modals.openFileDocuments.invalidFile")),
    ).toBeDefined();
    fireEvent.click(importButton());
    await vi.waitFor(async () => {
      expect(await fileNamesIn(driveA)).toEqual(["good"]);
    });
  });

  it("blocks the import entirely when no file is importable", async () => {
    addPendingImportFiles([corruptFile("bad.phd")]);
    renderModal();
    await waitForReady();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("flags unsupported document types", async () => {
    store.allowedDocumentTypes = ["some/other-type"];
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    await waitForReady();
    expect(
      screen.getByText(t("modals.openFileDocuments.unsupportedType")),
    ).toBeDefined();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("preselects the first drive and lets the user switch before importing", async () => {
    const driveB = await createDrive("Drive B");
    store.drives = [driveA, driveB];
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    await waitForReady();

    expect(screen.getByText("Drive A")).toBeDefined();
    const select = screen.getByRole("combobox");
    fireEvent.keyDown(select, { key: "ArrowDown" });
    fireEvent.click(await screen.findByText("Drive B"));
    // Drive B's nodes load before its rows are checked against them.
    await waitForReady();
    fireEvent.click(importButton());

    expect(store.selectedDriveId).toBe(driveB.header.id);
    await vi.waitFor(async () => {
      expect(await fileNamesIn(driveB)).toEqual(["doc"]);
    });
    expect(await fileNamesIn(driveA)).toEqual([]);
  });

  it("falls back to the global name for drives whose header has no name yet", async () => {
    const drive = driveDocumentModelModule.utils.createDocument();
    drive.state.global.name = "My Fresh Drive";
    store.drives = [await module.client.create(drive)];
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    expect(screen.getByText("My Fresh Drive")).toBeDefined();
  });

  it("shows the empty state with Create drive when there are no drives", async () => {
    store.drives = [];
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    expect(
      screen.getByText(t("modals.openFileDocuments.noDrives")),
    ).toBeDefined();
    fireEvent.click(
      screen.getByText(t("modals.openFileDocuments.createDrive")),
    );
    expect(store.modal).toEqual({ type: "addDrive" });
    // The pending files survive the detour to the add-drive modal.
    expect(getPendingImportFiles()).toHaveLength(1);
  });

  it("clears the pending store on cancel", async () => {
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    fireEvent.click(screen.getByText(t("common.cancel")));
    expect(getPendingImportFiles()).toHaveLength(0);
    expect(store.modal).toBeUndefined();
  });

  it("shows a read-only notice when the user may not create documents", async () => {
    store.allowList = ["0xsomeone-else"];
    addPendingImportFiles([await phdFile("doc.phd", await storedModel("doc"))]);
    renderModal();
    expect(
      screen.getByText(t("modals.openFileDocuments.notAllowed")),
    ).toBeDefined();
    expect(screen.queryByText(t("modals.openFileDocuments.import"))).toBeNull();
  });
});
