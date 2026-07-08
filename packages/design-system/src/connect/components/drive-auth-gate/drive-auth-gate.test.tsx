import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DriveAuthGate } from "./drive-auth-gate.js";

describe("DriveAuthGate", () => {
  it("renders the heading, explanation, and a login CTA", () => {
    render(<DriveAuthGate onLogin={() => {}} />);
    expect(screen.getByText("Log in to access this drive")).toBeDefined();
    expect(
      screen.getByText(/sign in with Renown to view or edit it/i),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /log in with/i })).toBeDefined();
  });

  it("calls onLogin when the CTA is clicked", () => {
    const onLogin = vi.fn();
    render(<DriveAuthGate onLogin={onLogin} />);
    fireEvent.click(screen.getByRole("button", { name: /log in with/i }));
    expect(onLogin).toHaveBeenCalledOnce();
  });

  it('renders the unauthorized state with mode="unauthorized"', () => {
    render(<DriveAuthGate mode="unauthorized" onLogout={() => {}} />);
    expect(
      screen.getByText("You don't have access to this drive"),
    ).toBeDefined();
    expect(
      screen.getByText(
        /the account you're signed in with isn't authorized to view or edit this drive/i,
      ),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: /log out/i })).toBeDefined();
  });

  it("calls onLogout when the Log out button is clicked", () => {
    const onLogout = vi.fn();
    render(<DriveAuthGate mode="unauthorized" onLogout={onLogout} />);
    fireEvent.click(screen.getByRole("button", { name: /log out/i }));
    expect(onLogout).toHaveBeenCalledOnce();
  });
});
