import { MissingSwitchboardError, type IRenown } from "@renown/sdk";
import type { WalletSession } from "@renown/sdk/wallet";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { render } from "vitest-browser-react";
import { addRenownEventHandler, setRenown } from "../../src/hooks/renown.js";
import { useRenownAuth } from "../../src/renown/use-renown-auth.js";

/* `login()` posts the credential to the app's switchboard. A missing switchboard
   is the one case where handing off to renown.id is right; any other failure has
   to stay on the page as `error`, or the user never sees it. */

function session(address: `0x${string}`): WalletSession {
  return {
    address,
    chainId: 1,
    signTypedData: () => Promise.resolve("0x" as `0x${string}`),
  };
}

function renownRejectingWith(error: Error): IRenown {
  return {
    status: "not-authorized",
    user: undefined,
    on: () => () => undefined,
    signIn: () => Promise.reject(error),
  } as unknown as IRenown;
}

function Probe({ session }: { session: WalletSession }) {
  const { login, error, pending } = useRenownAuth();
  return (
    <>
      <button onClick={() => login(session)}>login</button>
      <span data-testid="pending">{String(pending)}</span>
      <span data-testid="error">{error?.message ?? ""}</span>
    </>
  );
}

let open: MockInstance<typeof window.open>;

beforeEach(() => {
  addRenownEventHandler();
  // `openRenown` navigates with `window.open(url, "_self")`; never in a test.
  open = vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  open.mockRestore();
  install(undefined);
});

/* Both readers: the hook store feeds `useUser`/`useLoginStatus`; `window.ph`
   is what `completeSignIn` posts through. */
function install(renown: IRenown | undefined) {
  setRenown(renown);
  const ph = (window.ph ??= {});
  ph.renown = renown;
}

describe("useRenownAuth login fallback", () => {
  it("surfaces a switchboard rejection instead of redirecting", async () => {
    install(renownRejectingWith(new Error("Switchboard request failed: 400")));
    const screen = render(
      <Probe session={session("0x1000000000000000000000000000000000000001")} />,
    );

    await screen.getByRole("button").click();

    await expect
      .element(screen.getByTestId("error"))
      .toHaveTextContent("Switchboard request failed: 400");
    await expect
      .element(screen.getByTestId("pending"))
      .toHaveTextContent("false");
    expect(open).not.toHaveBeenCalled();
  });

  it("redirects to Renown only when no switchboard is configured", async () => {
    install(renownRejectingWith(new MissingSwitchboardError()));
    const screen = render(
      <Probe session={session("0x1000000000000000000000000000000000000002")} />,
    );

    await screen.getByRole("button").click();

    await vi.waitFor(() => expect(open).toHaveBeenCalledTimes(1));
    expect(open.mock.calls[0]?.[1]).toBe("_self");
  });
});
