import { fireEvent, render, screen } from "@testing-library/react";
import { ConnectUpgradeDriveModal } from "./upgrade-drive-modal";
import { it, vi } from "vitest";
describe("UpgradeDriveModal Component", () => {
  it("should match snapshot", () => {
    render(
      <ConnectUpgradeDriveModal
        body="You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?"
        cancelLabel="Cancel"
        continueLabel="Continue"
        data-testid="upgrade-drive-modal"
        header="Upgrade to cloud drive"
        onContinue={() => {}}
        open
      />,
    );

    const modalComponent = screen.getByTestId("upgrade-drive-modal");

    expect(modalComponent).toMatchSnapshot();
  });

  it("should render modal content", () => {
    const headerText = "Upgrade to cloud drive";
    const bodyText =
      "ou are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?";
    const cancelLabel = "Cancel";
    const continueLabel = "Continue";

    render(
      <ConnectUpgradeDriveModal
        body={bodyText}
        cancelLabel={cancelLabel}
        continueLabel={continueLabel}
        data-testid="upgrade-drive-modal"
        header={headerText}
        onContinue={() => {}}
        open
      />,
    );

    const header = screen.getByText(headerText);
    const body = screen.getByText(bodyText);
    const cancelButton = screen.getByText(cancelLabel);
    const deleteButton = screen.getByText(continueLabel);

    expect(header).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(cancelButton).toBeInTheDocument();
    expect(deleteButton).toBeInTheDocument();
  });

  it("should trigger onClose callback when cancel is clicked", () => {
    const onClose = vi.fn();
    const cancelLabel = "Cancel";

    render(
      <ConnectUpgradeDriveModal
        body="You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?"
        cancelLabel={cancelLabel}
        continueLabel="Continue"
        data-testid="upgrade-drive-modal"
        header="Upgrade to cloud drive"
        onContinue={() => {}}
        onOpenChange={onClose}
        open
      />,
    );

    fireEvent.click(screen.getByText(cancelLabel));

    expect(onClose).toHaveBeenCalled();
  });

  it("should trigger onDelete callback when CTA is clicked", () => {
    const onDelete = vi.fn();
    const continueLabel = "Continue";

    render(
      <ConnectUpgradeDriveModal
        body="You are moving files from a private to a shared drive. These files will become accessible to others in the shared drive.Do you want to proceed?"
        cancelLabel="Cancel"
        continueLabel={continueLabel}
        data-testid="upgrade-drive-modal"
        header="Upgrade to cloud drive"
        onContinue={onDelete}
        open
      />,
    );

    fireEvent.click(screen.getByText(continueLabel));

    expect(onDelete).toHaveBeenCalled();
  });
});
