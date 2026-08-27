import type { IRenown, User } from "@renown/sdk";
import type {
  WalletAdapterDescriptor,
  WalletController,
  WalletSession,
} from "@renown/sdk/wallet";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";
import { addRenownEventHandler, setRenown } from "../../src/hooks/renown.js";
import { RenownInitialUserProvider } from "../../src/renown/initial-user.js";
import { logout } from "../../src/renown/session.js";
import { useRenownAuth } from "../../src/renown/use-renown-auth.js";
import { RenownWalletProvider } from "../../src/renown/wallet-provider.js";

/* Adapters (and their wallet libraries) must mount on demand only: a restored
   session by itself must not fetch any wallet code. */

const ADDRESS = "0x1000000000000000000000000000000000000010" as const;
const USER = {
  did: `did:pkh:eip155:1:${ADDRESS}`,
  address: ADDRESS,
} as unknown as User;

function fakeRenown(current: User | undefined) {
  return {
    status: current ? "authorized" : "not-authorized",
    user: current,
    on: () => () => undefined,
    signIn: vi.fn(() => Promise.resolve(USER)),
    logout: vi.fn(() => Promise.resolve()),
  } as unknown as IRenown & {
    signIn: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };
}

// Both readers: the hook store feeds useUser; window.ph is what session.ts uses.
function install(renown: IRenown | undefined) {
  setRenown(renown);
  (window.ph ??= {}).renown = renown;
}

function fakeAdapter(redirectReturnParams: string[] = []) {
  const session: WalletSession = {
    address: ADDRESS,
    chainId: 1,
    signTypedData: () => Promise.resolve("0x" as `0x${string}`),
  };
  const controller = {
    connect: vi.fn(() => Promise.resolve(session)),
    disconnect: vi.fn(() => Promise.resolve()),
    getSession: () => undefined,
  } satisfies WalletController;
  const load = vi.fn(() =>
    Promise.resolve({
      Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
      useController: () => controller,
    }),
  );
  const descriptor: WalletAdapterDescriptor = {
    meta: { id: "fake", redirectReturnParams, supportedMethods: ["email"] },
    load,
  };
  return { descriptor, load, controller };
}

function LoginButton() {
  const { login } = useRenownAuth();
  return <button onClick={() => login(undefined, "email")}>login</button>;
}

function renderTree(descriptor: WalletAdapterDescriptor, user?: User) {
  return render(
    <RenownInitialUserProvider
      initialAuth={
        user ? { state: "authenticated", user } : { state: "anonymous" }
      }
    >
      <RenownWalletProvider adapters={[descriptor]}>
        <LoginButton />
      </RenownWalletProvider>
    </RenownInitialUserProvider>,
  );
}

function setRedirectReturn(on: boolean) {
  const url = new URL(window.location.href);
  if (on) url.searchParams.set("fake_oauth_code", "abc");
  else url.searchParams.delete("fake_oauth_code");
  window.history.replaceState({}, "", url.toString());
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 50));

beforeEach(() => {
  addRenownEventHandler();
});

afterEach(() => {
  install(undefined);
  setRedirectReturn(false);
});

describe("RenownWalletProvider activation", () => {
  it("mounts no adapter for a signed-in render with a restored session", async () => {
    const renown = fakeRenown(USER);
    install(renown);
    const { descriptor, load } = fakeAdapter();
    const screen = renderTree(descriptor, USER);
    await expect.element(screen.getByRole("button")).toBeVisible();
    await tick();
    expect(load).not.toHaveBeenCalled();
  });

  it("logout() from a signed-in state activates, disconnects, then logs out", async () => {
    const renown = fakeRenown(USER);
    install(renown);
    const { descriptor, load, controller } = fakeAdapter();
    const screen = renderTree(descriptor, USER);
    await expect.element(screen.getByRole("button")).toBeVisible();
    expect(load).not.toHaveBeenCalled();

    await logout();

    expect(load).toHaveBeenCalledTimes(1);
    expect(controller.disconnect).toHaveBeenCalledTimes(1);
    expect(renown.logout).toHaveBeenCalledTimes(1);
  });

  it("login() activates and completes sign-in", async () => {
    const renown = fakeRenown(undefined);
    install(renown);
    const { descriptor, load, controller } = fakeAdapter();
    const screen = renderTree(descriptor);
    await expect.element(screen.getByRole("button")).toBeVisible();
    expect(load).not.toHaveBeenCalled();

    await screen.getByRole("button").click();

    await vi.waitFor(() => expect(renown.signIn).toHaveBeenCalledTimes(1));
    expect(load).toHaveBeenCalledTimes(1);
    expect(controller.connect).toHaveBeenCalledWith("email");
  });

  it("an OAuth redirect return still activates on mount", async () => {
    install(fakeRenown(undefined));
    setRedirectReturn(true);
    const { descriptor, load } = fakeAdapter(["fake_oauth_code"]);
    renderTree(descriptor);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
  });
});
