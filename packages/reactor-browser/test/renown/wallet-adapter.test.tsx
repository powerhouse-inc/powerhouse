import type { WalletController } from "@renown/sdk/wallet";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { useRenownWalletAdapter } from "../../src/renown/use-renown-wallet-adapter.js";
import {
  setWalletActivator,
  setWalletAdapterController,
} from "../../src/renown/wallet-registry.js";

interface FakeController extends WalletController {
  label: string;
}

function controller(label: string): FakeController {
  return {
    label,
    connect: () => Promise.reject(new Error("unused")),
    disconnect: () => Promise.resolve(),
    getSession: () => undefined,
  };
}

// Deliberately not wrapped in a provider: the hook reads the registry.
function Probe({ id }: { id: string }) {
  const adapter = useRenownWalletAdapter<FakeController>(id);
  return <span data-testid="adapter">{adapter?.label ?? "none"}</span>;
}

afterEach(() => {
  setWalletActivator(undefined);
  setWalletAdapterController("privy", undefined);
  setWalletAdapterController("rainbow", undefined);
});

describe("useRenownWalletAdapter", () => {
  it("is undefined until the adapter publishes its controller", async () => {
    const screen = render(<Probe id="privy" />);
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("none");
    setWalletAdapterController("privy", controller("privy-ctl"));
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("privy-ctl");
  });

  it("returns only the adapter with the requested id", async () => {
    setWalletAdapterController("rainbow", controller("rainbow-ctl"));
    const screen = render(<Probe id="privy" />);
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("none");
  });

  it("activates the wallet tree on mount, even when the activator registers later", async () => {
    const activator = vi.fn(() => Promise.resolve(controller("merged")));
    const screen = render(<Probe id="privy" />);
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("none");
    expect(activator).not.toHaveBeenCalled();
    // The provider registers its activator in an effect after the child's.
    setWalletActivator(activator);
    await vi.waitFor(() => expect(activator).toHaveBeenCalledTimes(1));
  });

  it("does not activate when the adapter is already mounted", async () => {
    const activator = vi.fn(() => Promise.resolve(controller("merged")));
    setWalletActivator(activator);
    setWalletAdapterController("privy", controller("privy-ctl"));
    const screen = render(<Probe id="privy" />);
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("privy-ctl");
    expect(activator).not.toHaveBeenCalled();
  });

  it("clears the controller when the adapter unmounts", async () => {
    setWalletAdapterController("privy", controller("privy-ctl"));
    const screen = render(<Probe id="privy" />);
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("privy-ctl");
    setWalletAdapterController("privy", undefined);
    await expect
      .element(screen.getByTestId("adapter"))
      .toHaveTextContent("none");
  });
});
