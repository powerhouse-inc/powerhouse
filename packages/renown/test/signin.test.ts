import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Renown, RenownMemoryStorage } from "../src/common.js";
import type { SignCredentialTypedData } from "../src/credential.js";
import { MemoryKeyStorage, RenownCryptoBuilder } from "../src/crypto/index.js";
import { MemoryEventEmitter } from "../src/event/memory.js";
import { SwitchboardClient } from "../src/switchboard.js";

const ACCOUNT = privateKeyToAccount(
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
);
const sign: SignCredentialTypedData = (args) =>
  ACCOUNT.signTypedData(args as Parameters<typeof ACCOUNT.signTypedData>[0]);

const SB = "http://sb.test/graphql";

interface ReactorCall {
  query: string;
  variables: Record<string, unknown>;
}

// Route reactor writes and the user existence-check; record request bodies.
function mockReactor() {
  const calls: ReactorCall[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation((_input, init) => {
    const body = JSON.parse(
      (init?.body as string | undefined) ?? "{}",
    ) as ReactorCall;
    calls.push(body);
    let data: unknown = {};
    if (body.query.includes("renownUsers")) {
      data = { renownUsers: [] };
    } else if (body.query.includes("createEmptyDocument")) {
      data = { createEmptyDocument: { id: "doc-new" } };
    } else if (body.query.includes("mutateDocument")) {
      data = { mutateDocument: { id: body.variables.documentIdentifier } };
    }
    return Promise.resolve(
      new Response(JSON.stringify({ data }), { status: 200 }),
    );
  });
  return calls;
}

async function makeRenown(withSwitchboard = true) {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return new Renown(
    new RenownMemoryStorage(),
    new MemoryEventEmitter(),
    crypto,
    "test-app",
    "https://renown.test",
    undefined,
    withSwitchboard ? new SwitchboardClient(SB) : undefined,
  );
}

function actionTypes(calls: ReactorCall[]): string[] {
  return calls.flatMap(
    (c) =>
      (c.variables.actions as { type: string }[] | undefined)?.map(
        (a) => a.type,
      ) ?? [],
  );
}

describe("Renown.signIn", () => {
  afterEach(() => vi.restoreAllMocks());

  it("signs a credential, issues it, and authenticates without a redirect", async () => {
    const calls = mockReactor();
    const renown = await makeRenown();

    const user = await renown.signIn({
      address: ACCOUNT.address,
      chainId: 1,
      signTypedData: sign,
    });

    expect(user.address).toBe(ACCOUNT.address);
    expect(user.did).toBe(`did:pkh:eip155:1:${ACCOUNT.address.toLowerCase()}`);
    expect(user.credential).toBeDefined();
    expect(renown.status).toBe("authorized");
    expect(renown.user?.address).toBe(ACCOUNT.address);

    // Credential was issued (INIT) and the user document created.
    const types = actionTypes(calls);
    expect(types).toContain("INIT");
    expect(types).toContain("SET_ETH_ADDRESS");
  });

  it("throws when no switchboard endpoint is configured", async () => {
    const renown = await makeRenown(false);
    await expect(
      renown.signIn({
        address: ACCOUNT.address,
        chainId: 1,
        signTypedData: sign,
      }),
    ).rejects.toThrow(/switchboard/i);
    expect(renown.status).not.toBe("authorized");
  });
});
