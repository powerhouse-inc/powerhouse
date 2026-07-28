import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import { addRenownEventHandler, setRenown } from "../../src/hooks/renown.js";
import {
  RENOWN_INITIAL_ANONYMOUS,
  RENOWN_INITIAL_UNKNOWN,
  RenownInitialUserProvider,
  type RenownInitialAuth,
} from "../../src/renown/initial-user.js";
import { useRenownAuthAsync } from "../../src/renown/use-renown-auth.js";

const TEST_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const TEST_USER_DID = `did:pkh:eip155:1:${TEST_ADDRESS}`;

// `loading` is null (see hooks/loading.ts), which is what useLoginStatus reads
// as "loading" — the window where the SDK is being built.
const SDK_BUILDING = null;

function Probe() {
  const { state } = useRenownAuthAsync();
  return <span data-testid="state">{state}</span>;
}

function renderProbe(initialAuth: RenownInitialAuth) {
  return render(
    <RenownInitialUserProvider initialAuth={initialAuth}>
      <Probe />
    </RenownInitialUserProvider>,
  );
}

function setRedirectDid(did: string | undefined) {
  const url = new URL(window.location.href);
  if (did) url.searchParams.set("user", did);
  else url.searchParams.delete("user");
  window.history.replaceState({}, "", url.toString());
}

beforeEach(() => {
  window.ph ??= {};
  addRenownEventHandler();
});

afterEach(() => {
  setRenown(undefined);
  setRedirectDid(undefined);
});

describe("useRenownAuthAsync resolution", () => {
  it("resolves anonymous immediately while the SDK is still building", async () => {
    setRenown(SDK_BUILDING);
    const screen = renderProbe(RENOWN_INITIAL_ANONYMOUS);

    await expect
      .element(screen.getByTestId("state"))
      .toHaveTextContent("unauthenticated");
  });

  it("keeps resolving while a redirect sign-in is inbound", async () => {
    // The DID is in the URL but init has not consumed it yet, so the empty
    // credential store does not mean signed out.
    setRedirectDid(TEST_USER_DID);
    setRenown(SDK_BUILDING);
    const screen = renderProbe(RENOWN_INITIAL_ANONYMOUS);

    await expect
      .element(screen.getByTestId("state"))
      .toHaveTextContent("resolving");
  });

  it("keeps resolving when the first render does not know", async () => {
    setRenown(SDK_BUILDING);
    const screen = renderProbe(RENOWN_INITIAL_UNKNOWN);

    await expect
      .element(screen.getByTestId("state"))
      .toHaveTextContent("resolving");
  });

  it("reports the seeded user as authenticated", async () => {
    setRenown(SDK_BUILDING);
    const screen = renderProbe({
      state: "authenticated",
      user: {
        did: TEST_USER_DID,
        address: TEST_ADDRESS,
        networkId: "eip155",
        chainId: 1,
        credential: undefined,
      },
    });

    await expect
      .element(screen.getByTestId("state"))
      .toHaveTextContent("authenticated");
  });
});
