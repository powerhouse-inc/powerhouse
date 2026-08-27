import type { IRenown, LoginStatus, User } from "@renown/sdk";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { render } from "vitest-browser-react";
import {
  addRenownEventHandler,
  setRenown,
  useUser,
} from "../../src/hooks/renown.js";
import {
  RENOWN_INITIAL_UNKNOWN,
  RenownInitialUserProvider,
  type RenownInitialAuth,
} from "../../src/renown/initial-user.js";

/* useUser must never drop a seeded user for a frame when the SDK instance
   appears: every did-keyed consumer would reset and refetch. */

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const DID = `did:pkh:eip155:1:${ADDRESS}`;

const CREDENTIAL = {
  type: ["VerifiableCredential"],
  credentialSubject: { id: DID, address: ADDRESS, chainId: 1 },
  proof: { type: "JwtProof2020", jwt: "eyJ.test.sig" },
};

function user(): User {
  return {
    did: DID,
    address: ADDRESS,
    networkId: "eip155",
    chainId: 1,
    credential: CREDENTIAL,
  } as unknown as User;
}

// The same user as the cookie-session path builds it: different key order at
// every level, so an order-sensitive comparison would call it a new user.
function reorderedUser(): User {
  return {
    credential: {
      proof: { jwt: "eyJ.test.sig", type: "JwtProof2020" },
      credentialSubject: { chainId: 1, address: ADDRESS, id: DID },
      type: ["VerifiableCredential"],
    },
    chainId: 1,
    networkId: "eip155",
    address: ADDRESS,
    did: DID,
  } as unknown as User;
}

// Minimal SDK stand-in: a synchronous `user`, a `status`, and a "user" emitter.
function fakeInstance(current: User | undefined, status: LoginStatus) {
  const listeners = new Set<(u: User | undefined) => void>();
  const instance = {
    user: current,
    status,
    on: (event: string, cb: (u: User | undefined) => void) => {
      if (event === "user") listeners.add(cb);
      return () => listeners.delete(cb);
    },
    emitUser(next: User | undefined) {
      instance.user = next;
      listeners.forEach((cb) => cb(next));
    },
  };
  return instance as typeof instance & IRenown;
}

function Probe({ log }: { log: (u: User | undefined) => void }) {
  const current = useUser();
  log(current);
  return <span data-testid="did">{current?.did ?? "none"}</span>;
}

function renderProbe(
  initialAuth: RenownInitialAuth,
  log: (u: User | undefined) => void,
) {
  return render(
    <RenownInitialUserProvider initialAuth={initialAuth}>
      <Probe log={log} />
    </RenownInitialUserProvider>,
  );
}

const authenticated = (u: User): RenownInitialAuth => ({
  state: "authenticated",
  user: u,
});
const tick = () => new Promise((resolve) => setTimeout(resolve, 30));

beforeEach(() => {
  addRenownEventHandler();
  setRenown(undefined);
});

afterEach(() => {
  setRenown(undefined);
});

describe("useUser", () => {
  it("keeps the seed (and its identity) when the SDK restores the same user", async () => {
    const seed = user();
    const seen: (User | undefined)[] = [];
    const screen = renderProbe(authenticated(seed), (u) => seen.push(u));
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);

    setRenown(null); // SDK building
    await tick();
    // The same credential, re-parsed with different key order.
    setRenown(fakeInstance(reorderedUser(), "authorized"));
    await tick();

    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);
    expect(seen).not.toContain(undefined);
    expect(seen.every((u) => u === seed)).toBe(true);
  });

  it("keeps the seed while the SDK is still checking, then takes the emitted user", async () => {
    const seed = user();
    const seen: (User | undefined)[] = [];
    const screen = renderProbe(authenticated(seed), (u) => seen.push(u));
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);

    const instance = fakeInstance(undefined, "checking");
    setRenown(instance);
    await tick();
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);

    const refreshed = { ...user(), profile: { username: "alice" } } as User;
    instance.emitUser(refreshed);
    await tick();

    expect(seen).not.toContain(undefined);
    expect(seen.at(-1)).toBe(refreshed);
  });

  it("takes a changed user even when only a nested field differs", async () => {
    const seed = user();
    const seen: (User | undefined)[] = [];
    const screen = renderProbe(authenticated(seed), (u) => seen.push(u));
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);

    const resigned = reorderedUser();
    (resigned.credential as unknown as { proof: { jwt: string } }).proof.jwt =
      "eyJ.new.sig";
    setRenown(fakeInstance(resigned, "authorized"));
    await tick();

    expect(seen).not.toContain(undefined);
    expect(seen.at(-1)).toBe(resigned);
  });

  it("drops a stale seed when the SDK restored nothing", async () => {
    const screen = renderProbe(authenticated(user()), () => undefined);
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);

    setRenown(fakeInstance(undefined, "initial"));
    await expect.element(screen.getByTestId("did")).toHaveTextContent("none");
  });

  it("clears on sign-out", async () => {
    const instance = fakeInstance(user(), "authorized");
    setRenown(instance);
    const screen = renderProbe(authenticated(user()), () => undefined);
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);

    instance.emitUser(undefined);
    await expect.element(screen.getByTestId("did")).toHaveTextContent("none");
  });

  it("never blips through the client-only hydration sequence", async () => {
    // First client render does not know (hydration must match SSR), then the
    // localStorage seed lands, then the SDK instance appears.
    const seen: (User | undefined)[] = [];
    const seed = user();
    const log = (u: User | undefined) => seen.push(u);
    const screen = render(
      <RenownInitialUserProvider initialAuth={RENOWN_INITIAL_UNKNOWN}>
        <Probe log={log} />
      </RenownInitialUserProvider>,
    );
    await expect.element(screen.getByTestId("did")).toHaveTextContent("none");

    screen.rerender(
      <RenownInitialUserProvider initialAuth={authenticated(seed)}>
        <Probe log={log} />
      </RenownInitialUserProvider>,
    );
    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);
    const seededAt = seen.indexOf(seed);

    setRenown(null);
    await tick();
    setRenown(fakeInstance(reorderedUser(), "authorized"));
    await tick();

    await expect.element(screen.getByTestId("did")).toHaveTextContent(DID);
    expect(seen.slice(seededAt)).not.toContain(undefined);
    expect(seen.slice(seededAt).every((u) => u === seed)).toBe(true);
  });
});
