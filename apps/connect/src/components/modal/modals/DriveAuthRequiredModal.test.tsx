// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  phModal: { type: "driveAuthRequired" } as { type: string } | undefined,
  user: undefined as { address: string } | undefined,
  closePHModal: vi.fn(),
  logout: vi.fn(),
  openLogin: vi.fn(),
}));

// Stub the card: the real close control has its own coverage in design-system,
// and stubbing keeps the reactor-browser renown entry out of this test.
vi.mock("@powerhousedao/design-system/connect", () => ({
  DriveAuthGate: ({
    mode,
    onLogin,
    onLogout,
    onClose,
  }: {
    mode: "login" | "unauthorized";
    onLogin?: () => void;
    onLogout?: () => void;
    onClose?: () => void;
  }) => (
    <div data-testid="drive-auth-gate" data-mode={mode}>
      <button onClick={onLogin}>Log in with Renown</button>
      <button onClick={onLogout}>Log out</button>
      {onClose ? <button aria-label="Close" onClick={onClose} /> : null}
    </div>
  ),
}));

vi.mock("@powerhousedao/reactor-browser", () => ({
  closePHModal: mocks.closePHModal,
  logout: mocks.logout,
  usePHModal: () => mocks.phModal,
  useUser: () => mocks.user,
}));

vi.mock("../../../hooks/use-renown-login.js", () => ({
  useOpenRenownLogin: () => mocks.openLogin,
}));

import { DriveAuthRequiredModal } from "./DriveAuthRequiredModal.js";

describe("DriveAuthRequiredModal", () => {
  beforeEach(() => {
    mocks.phModal = { type: "driveAuthRequired" };
    mocks.user = undefined;
    mocks.closePHModal.mockClear();
    mocks.logout.mockClear();
    mocks.openLogin.mockClear();
  });

  it("closes when the close control is clicked", () => {
    render(<DriveAuthRequiredModal />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.closePHModal).toHaveBeenCalledOnce();
  });

  it("closes on Escape", () => {
    render(<DriveAuthRequiredModal />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mocks.closePHModal).toHaveBeenCalledOnce();
  });

  it("offers a close control in the unauthorized state too", () => {
    mocks.user = { address: "0xabc" };
    render(<DriveAuthRequiredModal />);
    expect(screen.getByTestId("drive-auth-gate").dataset.mode).toBe(
      "unauthorized",
    );
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(mocks.closePHModal).toHaveBeenCalledOnce();
  });

  it("still closes the modal before opening the login flow", () => {
    render(<DriveAuthRequiredModal />);
    fireEvent.click(
      screen.getByRole("button", { name: /log in with renown/i }),
    );
    expect(mocks.closePHModal).toHaveBeenCalledOnce();
    expect(mocks.openLogin).toHaveBeenCalledOnce();
    expect(mocks.closePHModal.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.openLogin.mock.invocationCallOrder[0],
    );
  });

  // The regression guard: the backdrop is click-through on purpose, and the
  // cookie banner is a root sibling of this portal, so an outside click must
  // never be read as a dismissal.
  it("does not close when an unrelated element outside the card is clicked", () => {
    render(
      <div>
        <button data-testid="cookie-banner">Accept cookies</button>
        <DriveAuthRequiredModal />
      </div>,
    );
    fireEvent.click(screen.getByTestId("cookie-banner"));
    expect(mocks.closePHModal).not.toHaveBeenCalled();
  });

  it("renders nothing and ignores Escape when another modal is open", () => {
    mocks.phModal = { type: "settings" };
    render(<DriveAuthRequiredModal />);
    expect(screen.queryByTestId("drive-auth-gate")).toBeNull();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mocks.closePHModal).not.toHaveBeenCalled();
  });

  it("stops listening for Escape once the modal closes", () => {
    const { rerender } = render(<DriveAuthRequiredModal />);
    mocks.phModal = undefined;
    rerender(<DriveAuthRequiredModal />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(mocks.closePHModal).not.toHaveBeenCalled();
  });
});
