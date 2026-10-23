import {
  driveCreateDocument,
  type DocumentDriveDocument,
} from "@powerhousedao/shared/document-drive";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { ensurePHEventHandlers } from "../src/graphql-client/graphql-reactor-provider.js";
import { useDocumentLinkProps } from "../src/hooks/document-link.js";
import { setDrives } from "../src/hooks/drives.js";

function inventoryDrive(): DocumentDriveDocument {
  const drive = driveCreateDocument({
    global: {
      name: "Inventory",
      icon: null,
      nodes: [
        {
          id: "item-1",
          name: "Bolts",
          kind: "file",
          documentType: "acme/inventory-item",
          parentFolder: null,
        },
      ],
    },
  });
  drive.header.slug = "inventory";
  return drive;
}

function Row({ id }: { id: string }) {
  const link = useDocumentLinkProps(id);
  return link ? <a {...link}>{id}</a> : <span>{id} (not in a drive yet)</span>;
}

describe("useDocumentLinkProps", () => {
  beforeEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
    ensurePHEventHandlers();
    setDrives([inventoryDrive()]);
  });

  afterEach(() => {
    window.ph = {};
    delete window.__phEventHandlersRegistered;
  });

  it("links a document to the drive that lists it, and nothing else", async () => {
    const screen = await render(
      <>
        <Row id="item-1" />
        <Row id="item-2" />
      </>,
    );
    await expect
      .element(screen.getByRole("link", { name: "item-1" }))
      .toHaveAttribute("href", "/d/inventory/bolts-item-1");
    await expect
      .element(screen.getByText("item-2 (not in a drive yet)"))
      .toBeVisible();
  });
});
