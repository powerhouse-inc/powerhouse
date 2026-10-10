// @vitest-environment happy-dom
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProvisionPanel } from "./ProvisionPanel.js";

describe("ProvisionPanel", () => {
  it("renders an empty-state placeholder with no reactors", () => {
    const view = render(
      <ProvisionPanel
        entries={[]}
        onKill={() => {}}
        onProvision={() => {}}
        onSelect={() => {}}
        selected={undefined}
      />,
    );

    expect(view.getByText("No reactors provisioned yet.")).toBeTruthy();
  });

  it("rejects an empty name without calling onProvision", () => {
    const onProvision = vi.fn();
    const view = render(
      <ProvisionPanel
        entries={[]}
        onKill={() => {}}
        onProvision={onProvision}
        onSelect={() => {}}
        selected={undefined}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    expect(onProvision).not.toHaveBeenCalled();
    expect(view.getByText("Name is required")).toBeTruthy();
  });

  it("submits the trimmed name and selected kind", () => {
    const onProvision = vi.fn();
    const view = render(
      <ProvisionPanel
        entries={[]}
        onKill={() => {}}
        onProvision={onProvision}
        onSelect={() => {}}
        selected={undefined}
      />,
    );

    fireEvent.change(view.getByPlaceholderText("alpha"), {
      target: { value: "  alpha  " },
    });
    fireEvent.change(view.getByDisplayValue("in-process"), {
      target: { value: "worker" },
    });
    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    // Sync mode defaults to "local" (brokered); kind was switched to worker.
    // The attachment store defaults to "none": a reactor that holds no
    // attachment bytes is the cheapest one and stays the default (W3.4).
    expect(onProvision).toHaveBeenCalledWith({
      name: "alpha",
      kind: "worker",
      syncMode: "local",
      attachmentStore: "none",
    });
  });

  it("rejects a name that already exists among the entries", () => {
    const onProvision = vi.fn();
    const view = render(
      <ProvisionPanel
        entries={[
          {
            name: "alpha",
            descriptor: { kind: "in-process", name: "alpha" },
            status: "provisioning",
          },
        ]}
        onKill={() => {}}
        onProvision={onProvision}
        onSelect={() => {}}
        selected={undefined}
      />,
    );

    fireEvent.change(view.getByPlaceholderText("alpha"), {
      target: { value: "alpha" },
    });
    fireEvent.click(view.getByRole("button", { name: "Provision" }));

    expect(onProvision).not.toHaveBeenCalled();
    expect(view.getByText(/already exists/)).toBeTruthy();
  });

  it("calls onKill for the matching reactor", () => {
    const onKill = vi.fn();
    const view = render(
      <ProvisionPanel
        entries={[
          {
            name: "alpha",
            descriptor: { kind: "in-process", name: "alpha" },
            status: "provisioning",
          },
        ]}
        onKill={onKill}
        onProvision={() => {}}
        onSelect={() => {}}
        selected={undefined}
      />,
    );

    fireEvent.click(view.getByRole("button", { name: "Kill" }));

    expect(onKill).toHaveBeenCalledWith("alpha");
  });
});
