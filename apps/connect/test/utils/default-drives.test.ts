// @vitest-environment happy-dom
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

// The module under test imports heavy runtime dependencies (the full
// reactor-browser action library, kysely/pglite, the renown SDK). Stub them
// out: only the drive-registration behaviour of addDefaultDrivesForNewReactor
// is under test here.
vi.mock("@powerhousedao/reactor-browser", () => ({
  addDrive: vi.fn(),
  addRemoteDrive: vi.fn(),
  ChannelScheme: class {},
  isDriveAuthError: vi.fn(() => false),
  ReactorBuilder: class {},
  ReactorClientBuilder: class {},
  setDriveMetadata: vi.fn(),
  waitForDocumentReady: vi.fn(),
}));
vi.mock("@renown/sdk", () => ({ createSignatureVerifier: vi.fn() }));
vi.mock("document-model", () => ({ ConsoleLogger: class {} }));
vi.mock("kysely", () => ({ Kysely: class {} }));
vi.mock("kysely-pglite-dialect", () => ({ PGliteDialect: class {} }));
vi.mock("../../src/pglite.db.js", () => ({
  getReactorPGlite: vi.fn(),
}));
import {
  addDrive,
  addRemoteDrive,
  setDriveMetadata,
  waitForDocumentReady,
} from "@powerhousedao/reactor-browser";
import { addDefaultDrivesForNewReactor } from "../../src/utils/reactor.js";

function setPh(value: Record<string, unknown>): void {
  (window as unknown as { ph: Record<string, unknown> }).ph = value;
}

describe("addDefaultDrivesForNewReactor (issue #2838)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setPh({});
  });

  afterEach(() => {
    setPh({});
  });

  it("creates a local default drive with its configured id, metadata, and app", async () => {
    const isDocumentIdTaken = vi.fn().mockResolvedValue(false);
    setPh({ reactorClientModule: { client: { isDocumentIdTaken } } });

    await addDefaultDrivesForNewReactor([
      {
        local: true,
        id: "drive-1",
        name: "My Drive",
        icon: "https://example.test/icon.png",
        app: "powerhouse/generic-drive-explorer",
      },
    ]);

    expect(isDocumentIdTaken).toHaveBeenCalledWith("drive-1");
    expect(addDrive).toHaveBeenCalledTimes(1);
    expect(addDrive).toHaveBeenCalledWith(
      {
        id: "drive-1",
        global: {
          name: "My Drive",
          icon: "https://example.test/icon.png",
        },
      },
      "powerhouse/generic-drive-explorer",
    );
    expect(addRemoteDrive).not.toHaveBeenCalled();
  });

  it("does not re-create a local drive whose id already exists", async () => {
    const isDocumentIdTaken = vi.fn().mockResolvedValue(true);
    setPh({ reactorClientModule: { client: { isDocumentIdTaken } } });

    await addDefaultDrivesForNewReactor([
      { local: true, id: "drive-1", name: "My Drive" },
    ]);

    expect(isDocumentIdTaken).toHaveBeenCalledWith("drive-1");
    expect(addDrive).not.toHaveBeenCalled();
  });

  // A soft-deleted document keeps its id reserved on the create path, but
  // find() reports only live documents. Guarding with find() therefore
  // re-attempted addDrive on every boot after the user deleted the drive, and
  // every attempt failed with DocumentAlreadyExistsError.
  it("does not re-create a local default drive the user deleted", async () => {
    const find = vi.fn().mockResolvedValue({ results: [] });
    const isDocumentIdTaken = vi.fn().mockResolvedValue(true);
    setPh({ reactorClientModule: { client: { find, isDocumentIdTaken } } });

    await addDefaultDrivesForNewReactor([
      { local: true, id: "drive-1", name: "My Drive" },
    ]);

    expect(isDocumentIdTaken).toHaveBeenCalledWith("drive-1");
    expect(find).not.toHaveBeenCalled();
    expect(addDrive).not.toHaveBeenCalled();
  });

  it("treats omitted local-drive metadata as empty name, null icon, no app", async () => {
    const isDocumentIdTaken = vi.fn().mockResolvedValue(false);
    setPh({ reactorClientModule: { client: { isDocumentIdTaken } } });

    await addDefaultDrivesForNewReactor([{ local: true, id: "drive-1" }]);

    expect(addDrive).toHaveBeenCalledTimes(1);
    expect(addDrive).toHaveBeenCalledWith(
      { id: "drive-1", global: { name: "", icon: null } },
      undefined,
    );
  });

  it("keeps remote default drives on the existing registration path", async () => {
    (addRemoteDrive as Mock).mockResolvedValue("remote-drive-1");
    (setDriveMetadata as Mock).mockResolvedValue(undefined);
    (waitForDocumentReady as Mock).mockResolvedValue(undefined);
    const client = { find: vi.fn() };
    setPh({ reactorClient: client, reactorClientModule: { client } });

    await addDefaultDrivesForNewReactor([
      { url: "https://drive.example", name: "Drive", icon: null },
    ]);

    expect(addRemoteDrive).toHaveBeenCalledWith("https://drive.example");
    expect(waitForDocumentReady).toHaveBeenCalledWith(
      client,
      "remote-drive-1",
      {
        timeoutMs: 15_000,
      },
    );
    expect(setDriveMetadata).toHaveBeenCalledWith("remote-drive-1", {
      name: "Drive",
      icon: null,
    });
    expect(addDrive).not.toHaveBeenCalled();
  });

  it("runs local and remote entries concurrently without cross-interference", async () => {
    const isDocumentIdTaken = vi.fn().mockResolvedValue(false);
    (addRemoteDrive as Mock).mockResolvedValue("remote-drive-1");
    (setDriveMetadata as Mock).mockResolvedValue(undefined);
    (waitForDocumentReady as Mock).mockResolvedValue(undefined);
    const client = { isDocumentIdTaken };
    setPh({ reactorClient: client, reactorClientModule: { client } });

    await addDefaultDrivesForNewReactor([
      { url: "https://drive.example" },
      { local: true, id: "drive-1" },
    ]);

    expect(addRemoteDrive).toHaveBeenCalledTimes(1);
    expect(addDrive).toHaveBeenCalledTimes(1);
    expect(addDrive).toHaveBeenCalledWith(
      { id: "drive-1", global: { name: "", icon: null } },
      undefined,
    );
  });
});
