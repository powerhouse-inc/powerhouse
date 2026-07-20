// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  drives: [] as {
    header: { id: string; name: string };
    state: { global: { name: string; nodes: unknown[] } };
  }[],
  documentTypes: undefined as string[] | undefined,
  loadFile: vi.fn(),
  runOpenFileImports: vi.fn(),
  setSelectedDrive: vi.fn(),
  closePHModal: vi.fn(),
  showPHModal: vi.fn(),
  isAllowedToCreateDocuments: true,
}));

vi.mock("@powerhousedao/reactor-browser", () => {
  class DocumentModelNotFoundError extends Error {
    override readonly name = "DocumentModelNotFoundError";
    static isError(error: unknown): error is DocumentModelNotFoundError {
      return (
        error instanceof Error && error.name === "DocumentModelNotFoundError"
      );
    }
  }
  return {
    usePHModal: () => ({ type: "openFileDocuments" }),
    useDrives: () => mocks.drives,
    useDocumentTypes: () => mocks.documentTypes,
    useUserPermissions: () => ({
      isAllowedToCreateDocuments: mocks.isAllowedToCreateDocuments,
      isAllowedToEditDocuments: mocks.isAllowedToCreateDocuments,
    }),
    loadFile: mocks.loadFile,
    setSelectedDrive: mocks.setSelectedDrive,
    closePHModal: mocks.closePHModal,
    showPHModal: mocks.showPHModal,
    DocumentModelNotFoundError,
    isDocumentTypeSupported: (type: string, list?: string[]) =>
      !list || list.length === 0 || list.includes(type),
  };
});

vi.mock("@powerhousedao/connect/components", () => ({
  DriveIcon: () => null,
}));

// The modal consumes the pending-files store, the planning logic and the
// import driver through the utils barrel; route to the real modules (store +
// pure planner) and stub only the driver, without dragging the whole barrel
// (reactor, pglite, …) into the test.
vi.mock("@powerhousedao/connect/utils", async () => {
  const launchQueue = await vi.importActual("../../../utils/launch-queue.js");
  const plan = await vi.importActual("../../../utils/open-file-plan.js");
  return {
    ...launchQueue,
    ...plan,
    runOpenFileImports: mocks.runOpenFileImports,
  };
});

vi.mock("@powerhousedao/design-system", () => ({
  Modal: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
    open ? <div role="dialog">{children}</div> : null,
}));

vi.mock("@powerhousedao/design-system/connect", () => ({
  formatFileSize: (bytes: number) => `${bytes} B`,
  ModalButton: ({
    children,
    disabled,
    onClick,
  }: {
    children?: ReactNode;
    disabled?: boolean;
    onClick?: () => void;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Combobox: ({
    options,
    value,
    onChange,
  }: {
    options: { value: string; label: ReactNode }[];
    value: { value: string } | null;
    onChange: (option: { value: string }) => void;
  }) => (
    <div data-testid="drive-select" data-value={value?.value ?? ""}>
      {options.map((option) => (
        <button key={option.value} onClick={() => onChange(option)}>
          {option.label}
        </button>
      ))}
    </div>
  ),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

import {
  addPendingImportFiles,
  clearPendingImportFiles,
  getPendingImportFiles,
} from "../../../utils/launch-queue.js";
import { OpenFileDocumentsModal } from "./OpenFileDocumentsModal.js";

const makeDrive = (id: string, name: string, nodes: unknown[] = []) => ({
  header: { id, name },
  state: { global: { name, nodes } },
});

const rootFileNode = (
  name: string,
  documentType = "powerhouse/document-model",
  id = `node-${name}`,
) => ({ id, name, kind: "file", documentType, parentFolder: null });

// The modal caches parse results by pending-file key at module level, so
// every test file needs a unique identity.
let fileCounter = 0;
const makeFile = (name: string) =>
  new File(["x"], name, { lastModified: ++fileCounter });

const parsedDoc = (name: string, overrides: Record<string, unknown> = {}) => ({
  header: {
    id: `doc-${name}`,
    documentType: "powerhouse/document-model",
    name,
    ...overrides,
  },
});

const importButton = () =>
  screen.queryByText("modals.openFileDocuments.import") ??
  screen.getByText("modals.openFileDocuments.renameAndImport");

async function waitForReady() {
  await vi.waitFor(() => {
    expect(screen.queryByText("modals.openFileDocuments.checking")).toBeNull();
  });
}

describe("OpenFileDocumentsModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearPendingImportFiles();
    window.ph = { reactorClient: {} } as unknown as typeof window.ph;
    mocks.drives = [makeDrive("drive-a", "Drive A")];
    mocks.documentTypes = undefined;
    mocks.isAllowedToCreateDocuments = true;
    mocks.loadFile.mockImplementation((file: File) =>
      Promise.resolve(parsedDoc(file.name.replace(/\..+/gim, ""))),
    );
    mocks.runOpenFileImports.mockResolvedValue(undefined);
  });

  it("disables Import while files are being checked, then enables it", async () => {
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    expect(screen.getByText("modals.openFileDocuments.checking")).toBeDefined();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);

    await waitForReady();
    expect((importButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it("imports into the selected drive: clears the queue, closes, navigates, runs the driver", async () => {
    const file = makeFile("doc.phd");
    addPendingImportFiles([file]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();

    fireEvent.click(importButton());
    expect(getPendingImportFiles()).toHaveLength(0);
    expect(mocks.closePHModal).toHaveBeenCalled();
    expect(mocks.setSelectedDrive).toHaveBeenCalledWith(mocks.drives[0]);
    expect(mocks.runOpenFileImports).toHaveBeenCalledWith({
      driveId: "drive-a",
      imports: [{ file, name: "doc" }],
      documentTypes: undefined,
    });
  });

  it("renames duplicates and labels the button accordingly", async () => {
    mocks.drives = [makeDrive("drive-a", "Drive A", [rootFileNode("doc")])];
    const file = makeFile("doc.phd");
    addPendingImportFiles([file]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();

    expect(
      screen.getByText("modals.openFileDocuments.duplicateHint"),
    ).toBeDefined();
    const button = screen.getByText("modals.openFileDocuments.renameAndImport");
    fireEvent.click(button);
    expect(mocks.runOpenFileImports).toHaveBeenCalledWith(
      expect.objectContaining({
        imports: [{ file, name: "doc (copy) 1" }],
      }),
    );
  });

  it("announces an id duplicate as a copy without renaming", async () => {
    mocks.drives = [
      makeDrive("drive-a", "Drive A", [
        rootFileNode("other", "powerhouse/document-model", "doc-doc"),
      ]),
    ];
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();

    expect(
      screen.getByText("modals.openFileDocuments.duplicateCopyHint"),
    ).toBeDefined();
    expect(screen.getByText("modals.openFileDocuments.import")).toBeDefined();
  });

  it("labels a batch-internal name clash as a rename, not a drive duplicate", async () => {
    // Two opened files normalize to the same name into an empty drive: the
    // second is renamed to avoid clashing with its batch sibling, but nothing
    // of that name is in the drive, so it must not say "Already in this drive".
    const first = makeFile("doc.phd");
    const second = makeFile("doc.phdm");
    addPendingImportFiles([first, second]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();

    expect(
      screen.getByText("modals.openFileDocuments.renamedHint"),
    ).toBeDefined();
    expect(
      screen.queryByText("modals.openFileDocuments.duplicateHint"),
    ).toBeNull();

    fireEvent.click(importButton());
    expect(mocks.runOpenFileImports).toHaveBeenCalledWith(
      expect.objectContaining({
        imports: [
          { file: first, name: "doc" },
          { file: second, name: "doc (copy) 1" },
        ],
      }),
    );
  });

  it("excludes invalid files from the import and flags them inline", async () => {
    const bad = makeFile("bad.phd");
    const good = makeFile("good.phd");
    mocks.loadFile.mockImplementation((file: File) =>
      file === bad
        ? Promise.reject(new Error("corrupt zip"))
        : Promise.resolve(parsedDoc("good")),
    );
    addPendingImportFiles([bad, good]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();

    expect(
      screen.getByText("modals.openFileDocuments.invalidFile"),
    ).toBeDefined();
    fireEvent.click(importButton());
    expect(mocks.runOpenFileImports).toHaveBeenCalledWith(
      expect.objectContaining({
        imports: [{ file: good, name: "good" }],
      }),
    );
  });

  it("blocks the import entirely when no file is importable", async () => {
    mocks.loadFile.mockRejectedValue(new Error("corrupt zip"));
    addPendingImportFiles([makeFile("bad.phd")]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("flags unsupported document types", async () => {
    mocks.documentTypes = ["some/other-type"];
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();
    expect(
      screen.getByText("modals.openFileDocuments.unsupportedType"),
    ).toBeDefined();
    expect((importButton() as HTMLButtonElement).disabled).toBe(true);
  });

  it("preselects the first drive and lets the user switch before importing", async () => {
    mocks.drives = [
      makeDrive("drive-a", "Drive A"),
      makeDrive("drive-b", "Drive B"),
    ];
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    await waitForReady();

    expect(screen.getByTestId("drive-select").dataset.value).toBe("drive-a");
    fireEvent.click(screen.getByText("Drive B"));
    fireEvent.click(importButton());
    expect(mocks.runOpenFileImports).toHaveBeenCalledWith(
      expect.objectContaining({ driveId: "drive-b" }),
    );
  });

  it("falls back to the global name for drives whose header has no name yet", () => {
    mocks.drives = [
      {
        header: { id: "drive-new", name: "" },
        state: { global: { name: "My Fresh Drive", nodes: [] } },
      },
    ];
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    expect(screen.getByText("My Fresh Drive")).toBeDefined();
  });

  it("shows the empty state with Create drive when there are no drives", () => {
    mocks.drives = [];
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    expect(screen.getByText("modals.openFileDocuments.noDrives")).toBeDefined();
    fireEvent.click(screen.getByText("modals.openFileDocuments.createDrive"));
    expect(mocks.showPHModal).toHaveBeenCalledWith({ type: "addDrive" });
    // The pending files survive the detour to the add-drive modal.
    expect(getPendingImportFiles()).toHaveLength(1);
  });

  it("clears the pending store on cancel", () => {
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    fireEvent.click(screen.getByText("common.cancel"));
    expect(getPendingImportFiles()).toHaveLength(0);
    expect(mocks.closePHModal).toHaveBeenCalled();
  });

  it("shows a read-only notice when the user may not create documents", () => {
    mocks.isAllowedToCreateDocuments = false;
    addPendingImportFiles([makeFile("doc.phd")]);
    render(<OpenFileDocumentsModal />);
    expect(
      screen.getByText("modals.openFileDocuments.notAllowed"),
    ).toBeDefined();
    expect(screen.queryByText("modals.openFileDocuments.import")).toBeNull();
  });
});
