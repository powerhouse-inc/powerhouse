import type {
  FileNode,
  FolderNode,
} from "@powerhousedao/shared/document-drive";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FolderItem } from "../folder-item/folder-item.js";
import { FileItem } from "./file-item.js";

const fileNode: FileNode = {
  id: "doc-1",
  kind: "file",
  name: "Doc",
  documentType: "powerhouse/test",
  parentFolder: null,
};
const folderNode: FolderNode = {
  id: "folder-1",
  kind: "folder",
  name: "Folder",
  parentFolder: null,
};

// fireEvent returns false when a handler called preventDefault.
function clickMenuButton() {
  return fireEvent.click(screen.getAllByRole("button")[0]);
}

describe("node card menu button", () => {
  it("does not follow the file card's link", () => {
    render(<FileItem fileNode={fileNode} href="/d/drive/doc" />);
    expect(screen.getByRole("link")).toBeDefined();
    expect(clickMenuButton()).toBe(false);
  });

  it("does not follow the folder card's link", () => {
    render(<FolderItem folderNode={folderNode} href="/d/drive/folder" />);
    expect(screen.getByRole("link")).toBeDefined();
    expect(clickMenuButton()).toBe(false);
  });
});
