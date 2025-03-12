import { fireEvent, render, screen } from "@testing-library/react";
import { ConnectDeleteItemModal } from "./delete-item-modal.js";
import { it, vi } from "vitest";
describe("Modal Component", () => {
  it("should match snapshot", () => {
    render(
      <ConnectDeleteItemModal
        body="Are you sure you want to delete this folder? All files and subfolders within it will be removed."
        cancelLabel="Cancel"
        data-testid="delete-modal"
        deleteLabel="Delete"
        header="Delete “Ecosystem Actors” folder?"
        onCancel={() => {}}
        onDelete={() => {}}
        open
      />,
    );

    const modalComponent = screen.getByTestId("delete-modal");

    expect(modalComponent).toMatchSnapshot();
  });

  it("should render modal content", () => {
    const headerText = "Delete “Ecosystem Actors” folder?";
    const bodyText =
      "Are you sure you want to delete this folder? All files and subfolders within it will be removed.";
    const cancelLabel = "Cancel";
    const deleteLabel = "Delete";

    render(
      <ConnectDeleteItemModal
        body={bodyText}
        cancelLabel={cancelLabel}
        data-testid="delete-modal"
        deleteLabel={deleteLabel}
        header={headerText}
        onCancel={() => {}}
        onDelete={() => {}}
        open
      />,
    );

    const header = screen.getByText(headerText);
    const body = screen.getByText(bodyText);
    const cancelButton = screen.getByText(cancelLabel);
    const deleteButton = screen.getByText(deleteLabel);

    expect(header).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(cancelButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();
  });

  it("should trigger onClose callback when cancel is clicked", () => {
    const onClose = vi.fn();
    const cancelLabel = "Cancel";

    render(
      <ConnectDeleteItemModal
        body="Are you sure you want to delete this folder? All files and subfolders within it will be removed."
        cancelLabel={cancelLabel}
        data-testid="delete-modal"
        deleteLabel="Delete"
        header="Delete “Ecosystem Actors” folder?"
        onCancel={onClose}
        onDelete={() => {}}
        open
      />,
    );

    fireEvent.click(screen.getByText(cancelLabel));

    expect(onClose).toHaveBeenCalled();
  });

  it("should trigger onDelete callback when CTA is clicked", () => {
    const onDelete = vi.fn();
    const deleteLabel = "Delete";

    render(
      <ConnectDeleteItemModal
        body="Are you sure you want to delete this folder? All files and subfolders within it will be removed."
        cancelLabel="Cancel"
        data-testid="delete-modal"
        deleteLabel={deleteLabel}
        header="Delete “Ecosystem Actors” folder?"
        onCancel={() => {}}
        onDelete={onDelete}
        open
      />,
    );

    fireEvent.click(screen.getByText(deleteLabel));

    expect(onDelete).toHaveBeenCalled();
  });
});
