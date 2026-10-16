// @vitest-environment happy-dom
import { ensurePHStore } from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared/document-drive";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BackButton } from "./editor-chrome.js";

const search = () => Object.fromEntries(new URLSearchParams(location.search));

beforeEach(() => {
  ensurePHStore().navigation = undefined;
});

afterEach(() => {
  cleanup();
  const store = ensurePHStore();
  store.drives = undefined;
  store.selectedDriveId = undefined;
  store.selectedNodeId = undefined;
  window.history.replaceState(null, "", "/");
});

describe("BackButton", () => {
  it("leads a deep-linked editor to the studio root, keeping its item", () => {
    // The workflow sits in the studio's hidden home folder.
    const store = ensurePHStore();
    store.drives = [
      {
        header: { id: "drive-1", slug: "studio" },
        state: {
          global: {
            nodes: [
              { id: "home", kind: "folder", name: "home", parentFolder: null },
              { id: "wf-1", kind: "file", name: "wf", parentFolder: "home" },
            ],
          },
        },
      } as unknown as DocumentDriveDocument,
    ];
    store.selectedDriveId = "drive-1";
    window.history.replaceState(null, "", "/d/studio/wf-1?item=wf-1&step=s1");
    render(<BackButton documentId="wf-1" />);

    fireEvent.click(screen.getByText("Back"));

    expect(location.pathname).toBe("/d/studio");
    expect(search()).toEqual({ item: "wf-1" });
  });
});
