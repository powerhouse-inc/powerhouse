// @vitest-environment happy-dom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const showPHModal = vi.fn();
vi.mock("@powerhousedao/reactor-browser", () => ({ showPHModal }));

const { setWorkerConnectionStatus } = await import("../connection-state.js");
const { ConnectionBanner } = await import("./connection-banner.js");

describe("ConnectionBanner", () => {
  it("keeps clear storage reachable when the store is unusable", () => {
    setWorkerConnectionStatus("storage-unusable");
    render(<ConnectionBanner />);

    expect(screen.getByText(/storage is unusable/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /clear storage/i }));
    expect(showPHModal).toHaveBeenCalledWith({ type: "clearStorage" });
  });
});
