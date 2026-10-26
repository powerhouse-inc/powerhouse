// @vitest-environment happy-dom
import { fireEvent, render, waitFor } from "@testing-library/react";
import {
  HOST_EXPORTS,
  type HostExportFixture,
} from "../lib/__fixtures__/host-export/index.js";
import { describe, expect, it, vi } from "vitest";
import { HostImportPanel, MAX_IMPORT_BYTES } from "./HostImportPanel.js";

function fixtureText(name: HostExportFixture): string {
  return HOST_EXPORTS[name];
}

function renderPanel() {
  const onImport = vi.fn();
  const view = render(<HostImportPanel onImport={onImport} />);
  const paste = (text: string) => {
    fireEvent.change(view.getByTestId("host-import-text"), {
      target: { value: text },
    });
    fireEvent.click(view.getByRole("button", { name: "Load" }));
  };
  const button = (name: string) =>
    view.getByRole("button", { name }) as HTMLButtonElement;
  return { view, onImport, paste, button };
}

describe("HostImportPanel", () => {
  it("shows why pasted text is not an export", () => {
    const { view, paste } = renderPanel();

    paste("{nope");

    expect(view.getByTestId("host-import-issues").textContent).toMatch(
      /Not JSON/,
    );
    expect(view.queryByRole("button", { name: "Save set" })).toBeNull();
  });

  it("renders the cli export's rows with the derived URL", () => {
    const { view, paste, button } = renderPanel();

    paste(fixtureText("cli"));

    expect(
      (
        view.getByTestId(
          "host-import-url-cli-switchboard.main",
        ) as HTMLInputElement
      ).value,
    ).toBe("http://localhost:7491/graphql");
    expect(
      view.getByTestId("host-import-status-cli-switchboard.main").textContent,
    ).toBe("derived, unverified");
    expect(view.getByText("ph host check cli")).toBeTruthy();
    expect(button("Save set").disabled).toBe(false);
  });

  it("keeps Save disabled until a missing URL is filled", () => {
    const { view, paste, button, onImport } = renderPanel();

    paste(fixtureText("assistant"));

    expect(button("Save set").disabled).toBe(true);
    expect(
      view.getByText("assistant.switchboard needs a GraphQL URL."),
    ).toBeTruthy();

    fireEvent.change(
      view.getByTestId("host-import-url-assistant.switchboard"),
      {
        target: { value: "http://localhost:4001/graphql" },
      },
    );
    fireEvent.click(button("Save set"));

    expect(onImport).toHaveBeenCalledWith({
      setName: "assistant",
      descriptors: [
        {
          kind: "remote",
          name: "assistant.switchboard",
          remote: { url: "http://localhost:4001/graphql" },
        },
      ],
      source: {
        project: { name: "my-project", root: "/project" },
        host: "assistant",
      },
      activate: false,
    });
  });

  it("blocks duplicate names and an empty selection", () => {
    const { view, paste, button } = renderPanel();

    paste(fixtureText("vetra"));
    fireEvent.change(view.getByTestId("host-import-name-vetra-studio.main"), {
      target: { value: "vetra-switchboard.main" },
    });

    expect(button("Save set").disabled).toBe(true);
    expect(
      view.getByText('Two rows are named "vetra-switchboard.main".'),
    ).toBeTruthy();

    fireEvent.click(view.getByTestId("host-import-include-vetra-studio.main"));
    fireEvent.click(
      view.getByTestId("host-import-include-vetra-switchboard.main"),
    );

    expect(view.getByText("Include at least one row.")).toBeTruthy();
  });

  it("loads a file dropped on the page and saves with provisioning", async () => {
    const { view, button, onImport } = renderPanel();
    const file = new File([fixtureText("connect")], "connect.json", {
      type: "application/json",
    });

    fireEvent.drop(window, {
      dataTransfer: { files: [file], types: ["Files"] },
    });

    await waitFor(() =>
      expect(view.getByTestId("host-import-name-connect.main")).toBeTruthy(),
    );
    fireEvent.click(button("Save & provision"));

    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({
        setName: "connect",
        activate: true,
        descriptors: [
          expect.objectContaining({ kind: "worker", name: "connect.main" }),
        ],
      }),
    );
    expect(view.queryByTestId("host-import-review")).toBeNull();
  });

  it("shows the drop overlay while files are dragged over the page", () => {
    const { view } = renderPanel();

    fireEvent.dragOver(window, { dataTransfer: { types: ["Files"] } });
    expect(view.getByText(/Drop an exported host/)).toBeTruthy();

    fireEvent.dragLeave(window, { relatedTarget: null });
    expect(view.queryByText(/Drop an exported host/)).toBeNull();
  });

  it("refuses a file over the size limit", async () => {
    const { view } = renderPanel();
    const file = new File(["x"], "huge.json");
    Object.defineProperty(file, "size", { value: MAX_IMPORT_BYTES + 1 });

    fireEvent.change(view.getByTestId("host-import-file"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(view.getByTestId("host-import-issues").textContent).toMatch(
        /huge\.json is 5\.0 MB; the limit is 5 MB/,
      ),
    );
  });
});
