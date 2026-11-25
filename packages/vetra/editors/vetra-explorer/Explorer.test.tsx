import {
  addDocument,
  dispatchActions,
  useDocumentModelModules,
  useSelectedNode,
  useSetSelectedNode,
} from "@powerhousedao/reactor-browser";
import type {
  DocumentDriveDocument,
  Node,
} from "@powerhousedao/shared/document-drive";
import { fireEvent, render, screen } from "@testing-library/react";
import type { DocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { layoutFolderId } from "../../drive-layout/index.js";
import {
  NO_SPECIFICATIONS,
  NOTHING_SELECTED,
  VetraExplorer,
} from "./Explorer.js";
import { EXPLORER_DOCUMENT_TYPES } from "./layout.js";
import { PLACEHOLDER_NOTE } from "./Placeholder.js";

type TypeOption = { documentType: string; name: string };
type ModalProps = {
  open: boolean;
  documentTypes: TypeOption[];
  onCreate: (input: { name: string; documentType: string }) => void;
};
const modal = vi.hoisted(() => ({ props: undefined as unknown }));

vi.mock("@powerhousedao/design-system/connect", () => ({
  CreateDocumentWithTypeModal: (props: unknown) => {
    modal.props = props;
    return null;
  },
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  addDocument: vi.fn(),
  dispatchActions: vi.fn(),
  preloadEditorModule: vi.fn(),
  useDocumentModelModules: vi.fn(),
  useEditorModules: vi.fn(() => []),
  useSelectedNode: vi.fn(),
  useSetSelectedNode: vi.fn(),
  useUserPermissions: vi.fn(() => ({ isAllowedToCreateDocuments: true })),
}));

const file = (id: string, name: string, documentType: string): Node =>
  ({ kind: "file", id, name, documentType, parentFolder: null }) as Node;

const drive = (nodes: Node[]) =>
  ({
    header: { id: "drive-1" },
    state: { global: { name: "Vetra", nodes } },
  }) as unknown as DocumentDriveDocument;

const model = (id: string) =>
  ({ documentModel: { global: { id } } }) as DocumentModelModule;

const order = file("dm", "Order", "powerhouse/document-model");
const pkg = file("p", "pizza-plaza", "powerhouse/package");
const select = vi.fn();
const modalProps = () => modal.props as ModalProps;

describe("vetra explorer", () => {
  beforeEach(() => {
    select.mockClear();
    vi.mocked(addDocument).mockReset();
    vi.mocked(dispatchActions).mockReset();
    vi.mocked(dispatchActions).mockResolvedValue({} as never);
    vi.mocked(useSetSelectedNode).mockReturnValue(select);
    vi.mocked(useSelectedNode).mockReturnValue(undefined);
    vi.mocked(useDocumentModelModules).mockReturnValue(
      EXPLORER_DOCUMENT_TYPES.map(model),
    );
  });

  it("tells a new project it has no specifications yet", () => {
    render(<VetraExplorer document={drive([])} packageName="pizza-plaza" />);
    expect(screen.getByText(NO_SPECIFICATIONS)).toBeInTheDocument();
    expect(screen.getByText("pizza-plaza")).toBeInTheDocument();
  });

  it("asks to select a document when none is open", () => {
    render(<VetraExplorer document={drive([pkg, order])} />);
    expect(screen.getByText(NOTHING_SELECTED)).toBeInTheDocument();
  });

  it("opens a document row's node and the package row's document", () => {
    render(<VetraExplorer document={drive([pkg, order])} />);
    fireEvent.click(screen.getByRole("button", { name: "Order" }));
    expect(select).toHaveBeenLastCalledWith(order);
    fireEvent.click(screen.getByRole("button", { name: "pizza-plaza" }));
    expect(select).toHaveBeenLastCalledWith(pkg);
  });

  it("shows the open document's editor in place of the empty state", () => {
    vi.mocked(useSelectedNode).mockReturnValue(order);
    render(
      <VetraExplorer document={drive([order])}>
        <div>the editor</div>
      </VetraExplorer>,
    );
    expect(screen.getByText("the editor")).toBeInTheDocument();
    expect(screen.queryByText(NOTHING_SELECTED)).toBeNull();
    expect(screen.getByRole("button", { name: "Order" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  it("shows a Build row's placeholder with the host's screenshot", () => {
    render(
      <VetraExplorer
        document={drive([order])}
        pageImages={{ versions: "/labs/versions.jpg" }}
        labsUrl="https://labs.example"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Versions" }));
    expect(
      screen.getByRole("heading", { name: "Build · Versions" }),
    ).toBeInTheDocument();
    expect(screen.getByText(PLACEHOLDER_NOTE)).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "/labs/versions.jpg",
    );
    expect(
      screen.getByRole("link", { name: "Open in Vetra Labs ↗" }),
    ).toHaveAttribute("href", "https://labs.example");
    // Not a document: nothing is selected in the drive.
    expect(select).not.toHaveBeenCalled();
  });

  it("closes the open document when a placeholder row is chosen", () => {
    vi.mocked(useSelectedNode).mockReturnValue(order);
    render(
      <VetraExplorer document={drive([order])}>
        <div>the editor</div>
      </VetraExplorer>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Environments" }));
    expect(select).toHaveBeenLastCalledWith(undefined);
  });

  it("leads from Environments to one environment and back", () => {
    render(
      <VetraExplorer
        document={drive([order])}
        pageImages={{ environments: "/e.jpg", environment: "/one.jpg" }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Environments" }));
    fireEvent.click(screen.getByRole("button", { name: "Open environment" }));
    expect(
      screen.getByRole("heading", { name: "Deploy · Environment" }),
    ).toBeInTheDocument();
    // The tree keeps Environments selected.
    expect(
      screen.getByRole("button", { name: "Environments" }),
    ).toHaveAttribute("aria-current", "true");
    fireEvent.click(screen.getByRole("button", { name: "← Environments" }));
    expect(
      screen.getByRole("heading", { name: "Deploy · Environments" }),
    ).toBeInTheDocument();
  });

  it("limits + to the folder's types and opens what it creates", async () => {
    const created = file("new", "Recipe", "powerhouse/document-model");
    vi.mocked(addDocument).mockResolvedValue(created as never);
    render(<VetraExplorer document={drive([order])} />);
    expect(modalProps().open).toBe(false);

    fireEvent.click(
      screen.getByRole("button", { name: "New Specify document" }),
    );
    expect(modalProps().open).toBe(true);
    expect(modalProps().documentTypes.map((t) => t.documentType)).toEqual([
      "powerhouse/document-model",
      "powerhouse/document-editor",
      "powerhouse/app",
      "powerhouse/subgraph",
      "powerhouse/processor",
    ]);

    fireEvent.click(
      screen.getByRole("button", { name: "New Ideate document" }),
    );
    expect(modalProps().documentTypes).toHaveLength(5);
    expect(modalProps().documentTypes[0]).toEqual({
      documentType: "powerhouse/problem-sheet",
      name: "Problem",
    });

    modalProps().onCreate({
      name: "Recipe",
      documentType: "powerhouse/document-model",
    });
    await vi.waitFor(() => expect(select).toHaveBeenLastCalledWith(created));
    // The drive had no layout folders: both are made, the document goes in.
    const [actions, target] = vi.mocked(dispatchActions).mock.calls[0];
    expect(target).toBe("drive-1");
    expect(
      (actions as { type: string; input: { name: string } }[]).map((action) => [
        action.type,
        action.input.name,
      ]),
    ).toEqual([
      ["ADD_FOLDER", "specify"],
      ["ADD_FOLDER", "document-models"],
    ]);
    expect(vi.mocked(addDocument).mock.calls[0].slice(0, 4)).toEqual([
      "drive-1",
      "Recipe",
      "powerhouse/document-model",
      layoutFolderId("drive-1", "specify/document-models"),
    ]);
  });

  it("files a new document in the folder the drive already has", async () => {
    const created = file("new", "Recipe", "powerhouse/feature");
    vi.mocked(addDocument).mockResolvedValue(created as never);
    const folders = [
      { kind: "folder", id: "i", name: "ideate", parentFolder: null },
      { kind: "folder", id: "f", name: "features", parentFolder: "i" },
    ] as Node[];
    render(<VetraExplorer document={drive(folders)} />);
    fireEvent.click(
      screen.getByRole("button", { name: "New Ideate document" }),
    );
    modalProps().onCreate({
      name: "Recipe",
      documentType: "powerhouse/feature",
    });
    await vi.waitFor(() => expect(select).toHaveBeenLastCalledWith(created));
    expect(dispatchActions).not.toHaveBeenCalled();
    expect(vi.mocked(addDocument).mock.calls[0][3]).toBe("f");
  });

  it("files at the drive root when the drive refuses the folders", async () => {
    const created = file("new", "Recipe", "powerhouse/feature");
    vi.mocked(addDocument).mockResolvedValue(created as never);
    vi.mocked(dispatchActions).mockResolvedValue(undefined);
    render(<VetraExplorer document={drive([])} />);
    fireEvent.click(
      screen.getByRole("button", { name: "New Ideate document" }),
    );
    modalProps().onCreate({
      name: "Recipe",
      documentType: "powerhouse/feature",
    });
    await vi.waitFor(() => expect(select).toHaveBeenLastCalledWith(created));
    expect(vi.mocked(addDocument).mock.calls[0][3]).toBeUndefined();
  });

  it("creates through the host's function when it is given one", async () => {
    const created = file("new", "Recipe", "powerhouse/feature");
    const createDocument = vi.fn().mockResolvedValue(created);
    render(
      <VetraExplorer document={drive([])} createDocument={createDocument} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "New Ideate document" }),
    );
    modalProps().onCreate({
      name: "Recipe",
      documentType: "powerhouse/feature",
    });
    await vi.waitFor(() => expect(select).toHaveBeenLastCalledWith(created));
    expect(createDocument).toHaveBeenCalledWith({
      name: "Recipe",
      documentType: "powerhouse/feature",
      parentFolder: layoutFolderId("drive-1", "ideate/features"),
    });
    expect(addDocument).not.toHaveBeenCalled();
  });

  it("has no + on Build and Deploy, nor where nothing can be created", () => {
    vi.mocked(useDocumentModelModules).mockReturnValue([]);
    render(<VetraExplorer document={drive([order])} />);
    expect(screen.queryByRole("button", { name: /^New / })).toBeNull();
  });
});
