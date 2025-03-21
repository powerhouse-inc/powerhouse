import { fireEvent, render, screen } from "@testing-library/react";
import { vi, it } from "vitest";
import { Modal } from "./index.js";

describe("Modal Component", () => {
  it("should match snapshot", () => {
    render(
      <Modal data-testid="modal" open>
        <div>Modal Content</div>
      </Modal>,
    );

    const modalComponent = screen.getByTestId("modal");

    expect(modalComponent).toMatchSnapshot();
  });

  it("should display modal content when open", () => {
    render(
      <Modal open>
        <div>Modal Content</div>
      </Modal>,
    );

    expect(screen.getByText("Modal Content")).toBeInTheDocument();
  });

  it("should call onClose callback when press esc", () => {
    const onClose = vi.fn();
    render(
      <Modal onOpenChange={onClose} open>
        <div>Modal Content</div>
      </Modal>,
    );

    fireEvent.keyDown(screen.getByText("Modal Content"), {
      key: "Escape",
      code: "Escape",
    });

    expect(onClose).toHaveBeenCalled();
  });
});
