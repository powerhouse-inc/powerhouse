import {
  showCreateDocumentModal,
  useDocumentModelModules,
} from "@powerhousedao/reactor-browser";
import { render } from "@testing-library/react";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import type { DocumentModelModule } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DOCUMENT_TYPES } from "./document-types.js";
import { BaseEditor } from "./editor.js";

const explorer = vi.hoisted(() => ({ onAddEditor: () => {} }));

vi.mock("./DriveExplorer.js", () => ({
  DriveExplorer: (props: { onAddEditor: () => void }) => {
    explorer.onAddEditor = props.onAddEditor;
    return null;
  },
}));

vi.mock("@powerhousedao/reactor-browser", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useDocumentModelModules: vi.fn(),
  useSetSelectedNode: vi.fn(() => vi.fn()),
  showCreateDocumentModal: vi.fn(),
  showDeleteNodeModal: vi.fn(),
}));

const drive = {
  header: { id: "drive-1" },
  state: {
    global: { name: "Vetra", nodes: [] },
    local: { triggers: [], listeners: [] },
  },
} as unknown as DocumentDriveDocument;

const model = (id: string) =>
  ({ documentModel: { global: { id } } }) as DocumentModelModule;

describe("vetra drive app", () => {
  beforeEach(() => vi.mocked(showCreateDocumentModal).mockClear());

  it("creates documents of the models loaded now, not at first render", () => {
    vi.mocked(useDocumentModelModules).mockReturnValue([
      model(DOCUMENT_TYPES.documentModel),
    ]);
    const { rerender } = render(
      <BaseEditor document={drive} dispatch={() => {}} />,
    );
    // Same count, different model: a length-keyed callback would miss it.
    vi.mocked(useDocumentModelModules).mockReturnValue([
      model(DOCUMENT_TYPES.documentEditor),
    ]);
    rerender(<BaseEditor document={drive} dispatch={() => {}} />);

    explorer.onAddEditor();
    expect(showCreateDocumentModal).toHaveBeenCalledWith(
      DOCUMENT_TYPES.documentEditor,
    );
  });
});
