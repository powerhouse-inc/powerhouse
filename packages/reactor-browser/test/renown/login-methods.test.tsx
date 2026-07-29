import type { WalletAdapterDescriptor } from "@renown/sdk/wallet";
import { afterEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { useRenownLoginMethods } from "../../src/renown/login-methods.js";
import { setWalletDescriptors } from "../../src/renown/wallet-registry.js";

function descriptor(
  id: string,
  supportedMethods: string[],
): WalletAdapterDescriptor {
  return {
    meta: { id, redirectReturnParams: [], supportedMethods },
    load: () => Promise.reject(new Error("not loaded in this test")),
  } as unknown as WalletAdapterDescriptor;
}

// Deliberately not wrapped in a provider: the hook reads the registry.
function Probe() {
  const methods = useRenownLoginMethods();
  return (
    <span data-testid="methods">{methods.map((m) => m.id).join(",")}</span>
  );
}

function LabelledProbe() {
  const methods = useRenownLoginMethods({ wallet: "Use my wallet" });
  return (
    <span data-testid="labels">{methods.map((m) => m.label).join("|")}</span>
  );
}

afterEach(() => {
  setWalletDescriptors(undefined);
});

describe("useRenownLoginMethods", () => {
  it("is empty when no provider has published descriptors", async () => {
    const screen = render(<Probe />);
    await expect.element(screen.getByTestId("methods")).toHaveTextContent("");
  });

  it("reads descriptors published by a provider elsewhere in the app", async () => {
    setWalletDescriptors([descriptor("rainbow", ["wallet"])]);
    const screen = render(<Probe />);
    await expect
      .element(screen.getByTestId("methods"))
      .toHaveTextContent("wallet");
  });

  it("follows descriptor order and dedupes shared methods", async () => {
    setWalletDescriptors([
      descriptor("privy", ["google", "email"]),
      descriptor("rainbow", ["wallet", "google"]),
    ]);
    const screen = render(<Probe />);
    await expect
      .element(screen.getByTestId("methods"))
      .toHaveTextContent("google,email,wallet");
  });

  it("re-renders when a provider mounts after the login UI", async () => {
    const screen = render(<Probe />);
    await expect.element(screen.getByTestId("methods")).toHaveTextContent("");
    setWalletDescriptors([descriptor("privy", ["google"])]);
    await expect
      .element(screen.getByTestId("methods"))
      .toHaveTextContent("google");
  });

  it("clears when the provider unmounts", async () => {
    setWalletDescriptors([descriptor("privy", ["google"])]);
    const screen = render(<Probe />);
    await expect
      .element(screen.getByTestId("methods"))
      .toHaveTextContent("google");
    setWalletDescriptors(undefined);
    await expect.element(screen.getByTestId("methods")).toHaveTextContent("");
  });

  it("applies overridden labels", async () => {
    setWalletDescriptors([descriptor("rainbow", ["wallet"])]);
    const screen = render(<LabelledProbe />);
    await expect
      .element(screen.getByTestId("labels"))
      .toHaveTextContent("Use my wallet");
  });
});
